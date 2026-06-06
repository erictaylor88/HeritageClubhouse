"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCourseDetail, GolfApiRateLimitError } from "@/lib/golf/api";
import { getCachedCourse, upsertCourseCache } from "@/lib/golf/cache";
import {
  courseMatchTokens,
  courseTitle,
  type CourseSearchResult,
} from "@/lib/courses";
import { sanitizeRoundFields } from "@/lib/rounds";
import type {
  CacheSuggestion,
  ConfirmedCourse,
  CourseImportResult,
  ImportResult,
} from "@/lib/import/types";

/**
 * Round-import server actions. Two phases, both auth-gated:
 *  1. {@link matchCoursesToCache} — free DB-only matching of imported course
 *     names against `course_cache` (zero GolfCourseAPI calls).
 *  2. {@link importRounds} — idempotent write of the user's confirmed selections.
 *
 * Cap discipline (CLAUDE.md hard rule #3): we never bulk-search the API. Cache
 * hits are free; the user's deliberate per-course searches happen client-side via
 * the existing `/api/courses/search` route; importing a picked result reuses its
 * coords through the cache write-through (the detail call is a rare fallback).
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Phase 1 — cache matching (no API)
// ---------------------------------------------------------------------------

const MAX_SUGGESTIONS = 3;

/**
 * Suggest `course_cache` matches for each imported course name, by significant
 * token overlap. Conservative: "exact" only when the normalized token sets are
 * identical, "likely" for strong overlap. Returns at most a few ranked
 * suggestions per source id; the UI surfaces the top one and lets the user
 * confirm, search, or skip.
 */
export async function matchCoursesToCache(
  courses: { sourceId: string; sourceName: string }[],
): Promise<Record<string, CacheSuggestion[]>> {
  const { user } = await requireUser();
  if (!user) return {};
  if (!Array.isArray(courses) || courses.length === 0) return {};

  // One read of the whole cache (small: low hundreds of rows at most).
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("course_cache")
    .select("course_id, club_name, course_name, address, lat, lng");
  if (error || !rows) return {};

  const cache = rows.map((r) => {
    const result: CourseSearchResult = {
      courseId: r.course_id,
      clubName: r.club_name,
      courseName: r.course_name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
    };
    const label = `${r.club_name ?? ""} ${r.course_name ?? ""}`;
    return { result, tokens: courseMatchTokens(label) };
  });

  const out: Record<string, CacheSuggestion[]> = {};
  for (const { sourceId, sourceName } of courses) {
    const srcTokens = courseMatchTokens(sourceName ?? "");
    if (srcTokens.size === 0) continue;

    const scored: { suggestion: CacheSuggestion; overlap: number }[] = [];
    for (const { result, tokens } of cache) {
      if (tokens.size === 0) continue;
      let overlap = 0;
      for (const t of srcTokens) if (tokens.has(t)) overlap += 1;
      if (overlap === 0) continue;

      // exact = identical token sets; likely = one set covers the other (subset),
      // with enough signal (≥2 shared tokens, or a single-token name that matches).
      const sameSize = srcTokens.size === tokens.size;
      const subset = overlap === srcTokens.size || overlap === tokens.size;
      const isExact = sameSize && overlap === srcTokens.size;
      const isLikely =
        subset && (overlap >= 2 || (srcTokens.size === 1 && overlap === 1));
      if (!isExact && !isLikely) continue;

      scored.push({
        suggestion: { course: result, confidence: isExact ? "exact" : "likely" },
        overlap,
      });
    }

    if (scored.length === 0) continue;
    scored.sort((a, b) => {
      // exact first, then by overlap.
      const ax = a.suggestion.confidence === "exact" ? 1 : 0;
      const bx = b.suggestion.confidence === "exact" ? 1 : 0;
      if (ax !== bx) return bx - ax;
      return b.overlap - a.overlap;
    });
    out[sourceId] = scored.slice(0, MAX_SUGGESTIONS).map((s) => s.suggestion);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Phase 2 — import (idempotent)
// ---------------------------------------------------------------------------

/** Multiset key for a round: identical (date, score) rounds dedupe against each other. */
function roundKey(datePlayed: string | null, score: number | null): string {
  return `${datePlayed ?? ""}|${score ?? ""}`;
}

/**
 * Ensure a course is in `course_cache`, reusing the search-provided coords
 * (no API call). Detail-API fallback only if the picked result lacked coords.
 * Returns the cached course id, or null with a reason on failure.
 */
async function ensureCached(
  course: CourseSearchResult,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getCachedCourse(course.courseId);
  if (existing) return { ok: true };

  if (course.lat !== null && course.lng !== null) {
    const cached = await upsertCourseCache({
      course_id: course.courseId,
      club_name: course.clubName,
      course_name: course.courseName,
      address: course.address,
      lat: course.lat,
      lng: course.lng,
      raw: { source: "import-result", ...course },
    });
    return cached
      ? { ok: true }
      : { ok: false, error: "Course has no coordinates." };
  }

  // Fallback: resolve coords via the detail API (rare).
  try {
    const detail = await getCourseDetail(course.courseId);
    if (detail) {
      const cached = await upsertCourseCache(detail);
      if (cached) return { ok: true };
    }
    return { ok: false, error: "Couldn't resolve course coordinates." };
  } catch (err) {
    if (err instanceof GolfApiRateLimitError) {
      return { ok: false, error: "Course lookups are rate-limited — try later." };
    }
    return { ok: false, error: "Couldn't look up that course." };
  }
}

/**
 * Import confirmed courses + their rounds for the signed-in user. Idempotent:
 * for each course we dedupe parsed rounds against the user's existing rounds by
 * a (date, score) multiset, inserting only the surplus — so re-uploading the
 * same export adds nothing. 9-hole rounds get a "(9 holes)" note so a half-round
 * gross score doesn't masquerade as a record low.
 */
export async function importRounds(
  payload: ConfirmedCourse[],
): Promise<ImportResult | { error: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You're not signed in." };
  if (!Array.isArray(payload) || payload.length === 0) {
    return { error: "Nothing to import." };
  }

  const perCourse: CourseImportResult[] = [];

  for (const item of payload) {
    const course = item?.course;
    const title = course ? courseTitle(course) : item?.sourceId ?? "Course";
    const result: CourseImportResult = {
      sourceId: item?.sourceId ?? "",
      courseTitle: title,
      inserted: 0,
      skipped: 0,
    };

    if (!course?.courseId || !Array.isArray(item.rounds)) {
      result.error = "Invalid course.";
      perCourse.push(result);
      continue;
    }

    // 1. Ensure cached (cache-first; coords reused — no API call in the common case).
    const cached = await ensureCached(course);
    if (!cached.ok) {
      result.error = cached.error;
      perCourse.push(result);
      continue;
    }

    // 2. Upsert the entry (played), fetching its id for the rounds insert.
    const { data: entry, error: entryErr } = await supabase
      .from("course_entries")
      .upsert(
        { user_id: user.id, course_id: course.courseId, status: "played" },
        { onConflict: "user_id,course_id" },
      )
      .select("id")
      .single();
    if (entryErr || !entry) {
      result.error = entryErr?.message ?? "Couldn't create the course entry.";
      perCourse.push(result);
      continue;
    }

    // 3. Build the existing-round multiset to dedupe against.
    const { data: existing, error: existErr } = await supabase
      .from("rounds")
      .select("date_played, score")
      .eq("user_id", user.id)
      .eq("course_id", course.courseId);
    if (existErr) {
      result.error = existErr.message;
      perCourse.push(result);
      continue;
    }
    const counts = new Map<string, number>();
    for (const r of existing ?? []) {
      const k = roundKey(r.date_played, r.score);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    // 4. Validate + dedupe, collecting rows to insert.
    const toInsert: {
      entry_id: string;
      user_id: string;
      course_id: string;
      date_played: string | null;
      score: number | null;
      notes: string | null;
    }[] = [];

    for (const round of item.rounds) {
      const sanitized = sanitizeRoundFields({
        datePlayed: round?.datePlayed ?? null,
        score: round?.score ?? null,
        notes: round?.holeCount === 9 ? "(9 holes)" : null,
      });
      if (!sanitized.ok) {
        result.skipped += 1; // skip an unparseable round rather than fail the course
        continue;
      }
      const { datePlayed, score, notes } = sanitized.value;
      const k = roundKey(datePlayed, score);
      const remaining = counts.get(k) ?? 0;
      if (remaining > 0) {
        counts.set(k, remaining - 1); // consume an existing duplicate
        result.skipped += 1;
        continue;
      }
      toInsert.push({
        entry_id: entry.id,
        user_id: user.id,
        course_id: course.courseId,
        date_played: datePlayed,
        score,
        notes,
      });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("rounds").insert(toInsert);
      if (insErr) {
        result.error = insErr.message;
        perCourse.push(result);
        continue;
      }
      result.inserted = toInsert.length;
    }

    perCourse.push(result);
  }

  revalidatePath("/map");

  return {
    coursesImported: perCourse.filter((c) => c.inserted > 0).length,
    roundsInserted: perCourse.reduce((n, c) => n + c.inserted, 0),
    roundsSkipped: perCourse.reduce((n, c) => n + c.skipped, 0),
    perCourse,
  };
}
