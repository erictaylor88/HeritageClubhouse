/**
 * Server-side loader for enriched stats: fetch the `raw` tee payloads for a
 * user's played courses and aggregate them. SERVER ONLY — takes an already-built
 * Supabase client (the RLS user client on /map, or the service-role admin client
 * on the public profile), so it stays agnostic to which read path called it.
 *
 * Only `raw` for played courses is fetched (not on the hot entries query), and a
 * cache miss / un-enriched row simply doesn't contribute — coverage is reported,
 * not faked.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { courseTitle, type CourseEntry } from "@/lib/courses";
import {
  computeEnrichedStats,
  enrichedCourseFromRaw,
  type EnrichedCourse,
  type EnrichedStats,
} from "@/lib/enriched-stats";

export async function loadEnrichedStats(
  client: SupabaseClient,
  entries: CourseEntry[],
): Promise<EnrichedStats> {
  const played = entries.filter((e) => e.status === "played");
  const ids = played.map((e) => e.course.courseId);
  if (ids.length === 0) return computeEnrichedStats([], 0);

  const { data } = await client
    .from("course_cache")
    .select("course_id, raw")
    .in("course_id", ids);

  const rawById = new Map<string, unknown>(
    ((data ?? []) as { course_id: string; raw: unknown }[]).map((r) => [
      r.course_id,
      r.raw,
    ]),
  );

  const courses: EnrichedCourse[] = [];
  for (const entry of played) {
    const course = enrichedCourseFromRaw(
      courseTitle(entry.course),
      entry.rounds.length,
      rawById.get(entry.course.courseId),
    );
    if (course) courses.push(course);
  }

  return computeEnrichedStats(courses, played.length);
}
