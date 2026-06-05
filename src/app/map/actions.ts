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
 * course_id), so re-adding simply updates the status — individual plays are
 * recorded separately via {@link addRound}.
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

  // 2. Upsert the entry (re-adding updates the status, preserves the note + rounds).
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

/**
 * Update the course-level note on one of the signed-in user's entries. Date and
 * score now live on rounds; the entry note is a course-level remark. RLS
 * enforces ownership; the explicit `user_id` filter is defense-in-depth.
 */
const MAX_NOTES = 2000;

export async function updateCourseEntry(
  entryId: string,
  notes: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!entryId) return { ok: false, error: "Missing entry." };

  const cleaned = sanitizeNotes(notes);
  if (!cleaned.ok) return cleaned;

  const { error } = await supabase
    .from("course_entries")
    .update({ notes: cleaned.value })
    .eq("id", entryId)
    .eq("user_id", user.id); // defense-in-depth; RLS already enforces ownership

  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}

/** Remove one of the signed-in user's course entries (cascade-deletes its rounds). */
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

// ---------------------------------------------------------------------------
// Rounds — individual plays of a course (the detail half of the split).
// ---------------------------------------------------------------------------

/** Editable per-round fields. */
export type RoundFields = {
  datePlayed: string | null;
  score: number | null;
  notes: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeNotes(
  notes: string | null,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof notes !== "string") return { ok: true, value: null };
  const trimmed = notes.trim();
  if (trimmed.length > MAX_NOTES)
    return { ok: false, error: `Notes must be ${MAX_NOTES} characters or fewer.` };
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

/** Normalize + validate a round's fields, or return an error string. */
function sanitizeRoundFields(
  fields: RoundFields,
): { ok: true; value: RoundFields } | { ok: false; error: string } {
  // Date played: null, or a real YYYY-MM-DD that isn't in the future.
  let datePlayed: string | null = null;
  if (fields.datePlayed) {
    const raw = fields.datePlayed.trim();
    if (!ISO_DATE.test(raw)) return { ok: false, error: "Invalid date." };
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()))
      return { ok: false, error: "Invalid date." };
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (raw > todayUtc)
      return { ok: false, error: "Date played can't be in the future." };
    datePlayed = raw;
  }

  // Score: null, or an integer in a sane golf range.
  let score: number | null = null;
  if (fields.score !== null && fields.score !== undefined) {
    const n = Number(fields.score);
    if (!Number.isInteger(n) || n < 1 || n > 300)
      return { ok: false, error: "Score must be a whole number (1–300)." };
    score = n;
  }

  const notes = sanitizeNotes(fields.notes);
  if (!notes.ok) return notes;

  return { ok: true, value: { datePlayed, score, notes: notes.value } };
}

/**
 * Add a round to one of the signed-in user's course entries. We look the entry
 * up server-side (verifying ownership) to source the denormalized course_id the
 * `rounds` insert policy requires — the client only supplies the entry id.
 */
export async function addRound(
  entryId: string,
  fields: RoundFields,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!entryId) return { ok: false, error: "Missing entry." };

  const sanitized = sanitizeRoundFields(fields);
  if (!sanitized.ok) return sanitized;

  // Source course_id from the owned entry (RLS scopes this to the user's rows).
  const { data: entry, error: lookupError } = await supabase
    .from("course_entries")
    .select("course_id")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };
  if (!entry) return { ok: false, error: "Course not found." };

  const { datePlayed, score, notes } = sanitized.value;
  const { error } = await supabase.from("rounds").insert({
    entry_id: entryId,
    user_id: user.id,
    course_id: entry.course_id,
    date_played: datePlayed,
    score,
    notes,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}

/** Update the editable fields on one of the signed-in user's rounds. */
export async function updateRound(
  roundId: string,
  fields: RoundFields,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!roundId) return { ok: false, error: "Missing round." };

  const sanitized = sanitizeRoundFields(fields);
  if (!sanitized.ok) return sanitized;
  const { datePlayed, score, notes } = sanitized.value;

  const { error } = await supabase
    .from("rounds")
    .update({ date_played: datePlayed, score, notes })
    .eq("id", roundId)
    .eq("user_id", user.id); // defense-in-depth; RLS already enforces ownership
  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}

/** Remove one of the signed-in user's rounds. */
export async function removeRound(roundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (!roundId) return { ok: false, error: "Missing round." };

  const { error } = await supabase
    .from("rounds")
    .delete()
    .eq("id", roundId)
    .eq("user_id", user.id); // defense-in-depth; RLS already enforces ownership
  if (error) return { ok: false, error: error.message };

  revalidatePath("/map");
  return { ok: true };
}
