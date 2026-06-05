import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  enrichCourse,
  getCachedCourseWithRaw,
  type CachedCourseWithRaw,
} from "@/lib/golf/cache";
import { GolfApiError, GolfApiRateLimitError } from "@/lib/golf/api";
import { parseScorecard } from "@/lib/golf/scorecard";
import {
  courseTitle,
  formatDatePlayed,
  isCourseStatus,
  roundsByDateDesc,
  type CourseStatus,
  type Round,
} from "@/lib/courses";
import { Scorecard } from "@/components/scorecard";
import { StatusChip } from "@/components/status-chip";

/**
 * /c/[id] — authed deep-view of a logged course's scorecard.
 *
 * Doubles as the lazy enrichment trigger: on first deep-view we fetch full
 * GolfCourseAPI detail and write it through to `course_cache.raw` (one call per
 * course, ever — see {@link enrichCourse}). The course must already be cached
 * (entries FK to `course_cache`, so anything anyone has logged is present),
 * which bounds enrichment to real courses. A public `/c/[id]` is a follow-on.
 */
export default async function CourseScorecardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const courseId = id?.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!courseId) notFound();

  // The course must already be cached. If not, it was never logged → 404.
  let course: CachedCourseWithRaw | null =
    await getCachedCourseWithRaw(courseId);
  if (!course) notFound();

  // Trigger lazy enrichment; soft-fail (serve what's cached) on cap/API errors.
  let rateLimited = false;
  try {
    const enriched = await enrichCourse(courseId);
    if (enriched) course = enriched;
  } catch (err) {
    if (err instanceof GolfApiRateLimitError) rateLimited = true;
    else if (!(err instanceof GolfApiError)) throw err;
    // GolfApiError (incl. missing key): just render without the scorecard.
  }

  // The signed-in user's own log for this course, if any: the entry header
  // (status + course note) plus every recorded round.
  const { data: entryRow } = await supabase
    .from("course_entries")
    .select("status, notes, rounds(id, date_played, score, notes)")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  const scorecard = parseScorecard(course.raw);
  const title = courseTitle({
    clubName: course.club_name,
    courseName: course.course_name,
  });
  const status: CourseStatus | null =
    entryRow && isCourseStatus(entryRow.status) ? entryRow.status : null;
  const rounds: Round[] = roundsByDateDesc(
    ((entryRow?.rounds ?? []) as {
      id: string;
      date_played: string | null;
      score: number | null;
      notes: string | null;
    }[]).map((r) => ({
      id: r.id,
      datePlayed: r.date_played,
      score: r.score,
      notes: r.notes,
    })),
  );
  const courseNote = entryRow?.notes ?? null;

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <header className="hc-grain flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5">
        <span className="flex flex-col">
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--forest)]">
            Heritage Clubhouse
          </span>
          <span className="hc-rule mt-0.5 w-full" />
        </span>
        <Link
          href="/map"
          className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)] underline-offset-4 hover:text-[var(--brass-deep)] hover:underline"
        >
          ← Back to map
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {/* Course heading */}
        <div className="flex flex-col gap-2">
          {status && <StatusChip status={status} />}
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
            {title}
          </h1>
          {course.address && (
            <p className="text-sm text-[var(--ink-muted)]">{course.address}</p>
          )}
        </div>

        {/* The user's own log: course note + each recorded round (newest first). */}
        {status && (courseNote || rounds.length > 0) && (
          <div className="mt-5 flex flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            {courseNote && (
              <p className="text-sm italic text-[var(--ink-muted)]">{courseNote}</p>
            )}
            {rounds.length > 0 && (
              <ul className="flex flex-col gap-2">
                {rounds.map((round) => (
                  <li
                    key={round.id}
                    className="flex flex-col gap-0.5 border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0"
                  >
                    {(round.datePlayed || round.score !== null) && (
                      <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                        {round.datePlayed && (
                          <span>Played {formatDatePlayed(round.datePlayed)}</span>
                        )}
                        {round.datePlayed && round.score !== null && <span> · </span>}
                        {round.score !== null && <span>Score {round.score}</span>}
                      </p>
                    )}
                    {round.notes && (
                      <p className="text-sm italic text-[var(--ink-muted)]">
                        {round.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Scorecard */}
        <section className="mt-8 flex flex-col gap-4 border-t border-[var(--line)] pt-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--forest)]">
            Scorecard
          </h2>

          {scorecard ? (
            <Scorecard tees={scorecard.tees} />
          ) : (
            <div className="rounded-md border border-dashed border-[var(--line)] px-4 py-6 text-center">
              <p className="font-[family-name:var(--font-display)] text-[15px] text-[var(--ink)]">
                {rateLimited
                  ? "Course details are temporarily unavailable."
                  : "No detailed scorecard for this course yet."}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                {rateLimited
                  ? "We're rate-limited right now — check back later and it'll fill in."
                  : "GolfCourseAPI doesn't have tee & hole data for this course."}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
