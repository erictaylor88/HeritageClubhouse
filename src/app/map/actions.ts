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
