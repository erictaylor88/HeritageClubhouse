import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCourseDetail,
  GolfApiRateLimitError,
  GolfApiError,
} from "@/lib/golf/api";
import { getCachedCourse, upsertCourseCache } from "@/lib/golf/cache";

/**
 * GET /api/courses/[id]
 *
 * Cache-first single-course resolver with write-through. Resolution order:
 *   1. Serve from `course_cache` if present (never re-fetch a cached course).
 *   2. On a miss, call the GolfCourseAPI detail endpoint (the coordinate
 *      fallback), write the result through to `course_cache` via the service
 *      role, and return it.
 *
 * This is the canonical way to guarantee a course is cached before an entry
 * joins to it. The detail call only fires on a true cache miss.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const courseId = id?.trim();
  if (!courseId) {
    return NextResponse.json({ error: "Missing course id" }, { status: 400 });
  }

  // 1. Cache-first.
  const cached = await getCachedCourse(courseId);
  if (cached) {
    return NextResponse.json({ course: cached, cached: true });
  }

  // 2. Cache miss → detail API + write-through.
  try {
    const detail = await getCourseDetail(courseId);
    if (!detail) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const stored = await upsertCourseCache(detail);
    if (!stored) {
      // Detail lacked usable coordinates — can't cache (lat/lng are NOT NULL).
      return NextResponse.json(
        { error: "Course has no coordinates" },
        { status: 422 },
      );
    }

    return NextResponse.json({ course: stored, cached: false });
  } catch (err) {
    if (err instanceof GolfApiRateLimitError) {
      return NextResponse.json(
        { error: "Rate limited", rateLimited: true },
        { status: 429 },
      );
    }
    if (err instanceof GolfApiError) {
      return NextResponse.json(
        { error: "Course lookup is unavailable right now." },
        { status: 502 },
      );
    }
    throw err;
  }
}
