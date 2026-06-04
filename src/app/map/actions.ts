"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCourseDetail, GolfApiRateLimitError } from "@/lib/golf/api";
import { getCachedCourse, upsertCourseCache } from "@/lib/golf/cache";
import {
  isCourseStatus,
  type CourseSearchResult,
  type CourseStatus,
} from "@/lib/courses";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Add (or re-status) a course on the signed-in user's map.
 *
 * Order matters: `course_entries.course_id` is FK'd to `course_cache`, so the
 * course must be cached first. We prefer the search-provided coordinates (no
 * API call) per the 50/day cap rules, and only fall back to the detail API when
 * the search result lacked coordinates. Entries are unique on (user_id,
 * course_id), so re-adding simply updates the status.
 */
export async function addCourseEntry(
  course: CourseSearchResult,
  status: CourseStatus,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  if (!isCourseStatus(status)) return { ok: false, error: "Invalid status." };
  if (!course?.courseId) return { ok: false, error: "Missing course." };

  // 1. Ensure the course is in course_cache (write-through).
  let cached = await getCachedCourse(course.courseId);
  if (!cached) {
    if (course.lat !== null && course.lng !== null) {
      // Preferred path: cache the search-provided coordinates, no API call.
      cached = await upsertCourseCache({
        course_id: course.courseId,
        club_name: course.clubName,
        course_name: course.courseName,
        address: course.address,
        lat: course.lat,
        lng: course.lng,
        raw: { source: "search-result", ...course },
      });
    } else {
      // Fallback: search lacked coords — resolve via the detail API.
      try {
        const detail = await getCourseDetail(course.courseId);
        if (detail) cached = await upsertCourseCache(detail);
      } catch (err) {
        if (err instanceof GolfApiRateLimitError) {
          return {
            ok: false,
            error: "Course lookups are rate-limited right now — try again later.",
          };
        }
        return { ok: false, error: "Couldn't look up that course right now." };
      }
    }
  }
  if (!cached) {
    return {
      ok: false,
      error: "This course has no coordinates yet, so it can't be mapped.",
    };
  }

  // 2. Upsert the entry (re-adding updates the status, preserves notes/score).
  const { error } = await supabase.from("course_entries").upsert(
    {
      user_id: user.id,
      course_id: course.courseId,
      status,
    },
    { onConflict: "user_id,course_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}

/** Editable per-entry fields. Coordinates/status are handled elsewhere. */
export type EntryEditFields = {
  datePlayed: string | null;
  bestScore: number | null;
  notes: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTES = 2000;

/** Normalize + validate the editable fields, or return an error string. */
function sanitizeEntryFields(
  fields: EntryEditFields,
): { ok: true; value: EntryEditFields } | { ok: false; error: string } {
  // Date played: null, or a real YYYY-MM-DD that isn't in the future.
  let datePlayed: string | null = null;
  if (fields.datePlayed) {
    const raw = fields.datePlayed.trim();
    if (!ISO_DATE.test(raw)) return { ok: false, error: "Invalid date." };
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()))
      return { ok: false, error: "Invalid date." };
    // Compare against today's UTC date; a "played" date can't be in the future.
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (raw > todayUtc)
      return { ok: false, error: "Date played can't be in the future." };
    datePlayed = raw;
  }

  // Best score: null, or an integer in a sane golf range.
  let bestScore: number | null = null;
  if (fields.bestScore !== null && fields.bestScore !== undefined) {
    const n = Number(fields.bestScore);
    if (!Number.isInteger(n) || n < 1 || n > 300)
      return { ok: false, error: "Best score must be a whole number (1–300)." };
    bestScore = n;
  }

  // Notes: trim, cap length, collapse empty to null.
  let notes: string | null = null;
  if (typeof fields.notes === "string") {
    const trimmed = fields.notes.trim();
    if (trimmed.length > MAX_NOTES)
      return { ok: false, error: `Notes must be ${MAX_NOTES} characters or fewer.` };
    notes = trimmed.length > 0 ? trimmed : null;
  }

  return { ok: true, value: { datePlayed, bestScore, notes } };
}

/**
 * Update the editable fields (date played / best score / notes) on one of the
 * signed-in user's entries. RLS enforces ownership; the explicit `user_id`
 * filter is defense-in-depth. `updated_at` is bumped by the
 * `course_entries_set_updated_at` BEFORE UPDATE trigger (migration 002), so we
 * don't set it here.
 */
export async function updateCourseEntry(
  entryId: string,
  fields: EntryEditFields,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!entryId) return { ok: false, error: "Missing entry." };

  const sanitized = sanitizeEntryFields(fields);
  if (!sanitized.ok) return sanitized;
  const { datePlayed, bestScore, notes } = sanitized.value;

  const { error } = await supabase
    .from("course_entries")
    .update({
      date_played: datePlayed,
      best_score: bestScore,
      notes,
    })
    .eq("id", entryId)
    .eq("user_id", user.id); // defense-in-depth; RLS already enforces ownership

  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}

/** Remove one of the signed-in user's course entries. */
export async function removeCourseEntry(entryId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("course_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id); // defense-in-depth; RLS already enforces ownership

  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}
