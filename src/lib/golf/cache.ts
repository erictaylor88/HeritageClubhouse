import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedCourse } from "@/lib/golf/api";

/**
 * `course_cache` write-through helpers. SERVER ONLY (uses the service-role
 * client). Course coordinates live once here; entries join to this table rather
 * than denormalizing.
 */

export type CachedCourse = {
  course_id: string;
  club_name: string | null;
  course_name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  cached_at: string;
};

/** Returns the cached course, or null on a cache miss. Cache-first always. */
export async function getCachedCourse(
  courseId: string,
): Promise<CachedCourse | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_cache")
    .select("course_id, club_name, course_name, address, lat, lng, cached_at")
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    throw new Error(`course_cache read failed: ${error.message}`);
  }
  return data as CachedCourse | null;
}

/**
 * Write-through upsert into `course_cache`. Requires valid coordinates
 * (`lat`/`lng` are NOT NULL in the table) — returns null if the normalized
 * course is missing coords, so callers can fall back to the detail API.
 */
export async function upsertCourseCache(
  course: NormalizedCourse,
): Promise<CachedCourse | null> {
  if (course.lat === null || course.lng === null) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_cache")
    .upsert(
      {
        course_id: course.course_id,
        club_name: course.club_name,
        course_name: course.course_name,
        address: course.address,
        lat: course.lat,
        lng: course.lng,
        raw: course.raw,
      },
      { onConflict: "course_id" },
    )
    .select("course_id, club_name, course_name, address, lat, lng, cached_at")
    .single();

  if (error) {
    throw new Error(`course_cache write failed: ${error.message}`);
  }
  return data as CachedCourse;
}
