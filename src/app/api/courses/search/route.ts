import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  searchCourses,
  GolfApiRateLimitError,
  GolfApiError,
} from "@/lib/golf/api";

/**
 * GET /api/courses/search?q=<query>
 *
 * Auth-gated proxy to GolfCourseAPI search. Search results are NOT cacheable,
 * so this is the real 50/day cap risk — the client must debounce hard and
 * enforce a min query length. We enforce a server-side min length too, and
 * soft-fail on 429 (never retry-hammer). Results are never cached at any layer.
 */

const MIN_QUERY_LENGTH = 3;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { results: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const courses = await searchCourses(query);
    const results = courses.map((c) => ({
      courseId: c.course_id,
      clubName: c.club_name,
      courseName: c.course_name,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
    }));
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof GolfApiRateLimitError) {
      // Soft-fail: tell the client to back off, return no results, don't retry.
      return NextResponse.json(
        { results: [], rateLimited: true },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (err instanceof GolfApiError) {
      return NextResponse.json(
        { error: "Course search is unavailable right now." },
        { status: 502 },
      );
    }
    throw err;
  }
}
