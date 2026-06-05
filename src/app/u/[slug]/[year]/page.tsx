import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  courseTitle,
  formatDatePlayed,
  type CourseEntry,
  type CourseStatus,
} from "@/lib/courses";
import { computeAnnual } from "@/lib/annual";

// Always re-query so the share gate reflects the live `is_shared` flag — an
// Annual for a map turned private must 404 immediately, never serve stale.
export const dynamic = "force-dynamic";

// Reasonable bounds; anything outside is a junk URL → 404 (keeps it un-indexable).
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

type EntryRow = {
  id: string;
  status: string;
  date_played: string | null;
  best_score: number | null;
  notes: string | null;
  course_cache: {
    course_id: string;
    club_name: string | null;
    course_name: string | null;
    address: string | null;
    lat: number;
    lng: number;
  } | null;
};

type SharedProfile = {
  id: string;
  username: string;
  display_name: string | null;
};

/** Parse a `[year]` route param into a bounded integer, or null if implausible. */
function parseYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

/**
 * Look up a publicly-shared profile by slug — service-role (bypasses RLS) but
 * gated by `is_shared = true`, so an unshared/unknown slug returns null → 404.
 * Mirrors the lookup in the profile page; `cache()` dedupes it between
 * generateMetadata and the page render for a single request.
 */
const getSharedProfile = cache(async function getSharedProfile(
  slug: string,
): Promise<SharedProfile | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, display_name")
    .eq("share_slug", slug.toLowerCase())
    .eq("is_shared", true)
    .maybeSingle();
  return data ?? null;
});

/** Shared entry-fetch, deduped per request (metadata + page both need it). */
const getEntries = cache(async function getEntries(
  userId: string,
): Promise<CourseEntry[]> {
  const admin = createAdminClient();
  const { data: entryRows } = await admin
    .from("course_entries")
    .select(
      "id, status, date_played, best_score, notes, course_cache(course_id, club_name, course_name, address, lat, lng)",
    )
    .eq("user_id", userId);

  return ((entryRows ?? []) as unknown as EntryRow[])
    .filter((row) => row.course_cache !== null)
    .map((row) => ({
      id: row.id,
      status: row.status as CourseStatus,
      datePlayed: row.date_played,
      bestScore: row.best_score,
      notes: row.notes,
      course: {
        courseId: row.course_cache!.course_id,
        clubName: row.course_cache!.club_name,
        courseName: row.course_cache!.course_name,
        address: row.course_cache!.address,
        lat: row.course_cache!.lat,
        lng: row.course_cache!.lng,
      },
    }));
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; year: string }>;
}): Promise<Metadata> {
  const { slug, year: yearParam } = await params;
  const year = parseYear(yearParam);
  const profile = year ? await getSharedProfile(slug) : null;
  if (!profile || !year) return { title: "Heritage Clubhouse" };

  const name = profile.display_name?.trim() || profile.username;
  const title = `${name}'s ${year} Annual — Heritage Clubhouse`;
  const description = `${name}'s year in golf — the courses played in ${year}.`;
  const url = `/u/${slug.toLowerCase()}/${year}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "Heritage Clubhouse",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function AnnualPage({
  params,
}: {
  params: Promise<{ slug: string; year: string }>;
}) {
  const { slug, year: yearParam } = await params;
  const year = parseYear(yearParam);
  if (!year) notFound();

  const profile = await getSharedProfile(slug);
  if (!profile) notFound();

  const entries = await getEntries(profile.id);
  const annual = computeAnnual(entries, year);
  const name = profile.display_name?.trim() || profile.username;

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar — public, read-only. */}
      <header className="hc-grain flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5">
        <span className="flex flex-col">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--forest)]"
          >
            Heritage Clubhouse
          </Link>
          <span className="hc-rule mt-0.5 w-full" />
        </span>
        <Link
          href={`/u/${slug.toLowerCase()}`}
          className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)] underline-offset-4 hover:text-[var(--brass-deep)] hover:underline"
        >
          ← {name}&apos;s Clubhouse
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:py-14">
        {/* Masthead */}
        <div className="flex flex-col items-center text-center">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--brass-deep)]">
            The Annual
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-6xl font-semibold leading-none tracking-tight text-[var(--ink)] md:text-7xl">
            {year}
          </h1>
          <span className="hc-rule mt-4 w-28" />
          <p className="mt-4 text-[15px] text-[var(--ink-muted)]">
            {name}&apos;s year in golf
          </p>
        </div>

        {annual.courses === 0 ? (
          <div className="mt-12 rounded-md border border-dashed border-[var(--line)] px-4 py-10 text-center">
            <p className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
              No rounds recorded in {year}.
            </p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Courses appear here once they&apos;re logged with a play date in {year}.
            </p>
          </div>
        ) : (
          <>
            {/* By the numbers */}
            <dl className="mt-12 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)]">
              {[
                {
                  label: annual.courses === 1 ? "Course" : "Courses",
                  value: annual.courses,
                },
                {
                  label: annual.states === 1 ? "State" : "States",
                  value: annual.states,
                },
                {
                  label: annual.countries === 1 ? "Country" : "Countries",
                  value: annual.countries,
                },
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="flex flex-col items-center gap-1 bg-[var(--surface)] px-4 py-6"
                >
                  <dd className="font-[family-name:var(--font-display)] text-4xl font-semibold tabular-nums text-[var(--forest)]">
                    {cell.value}
                  </dd>
                  <dt className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    {cell.label}
                  </dt>
                </div>
              ))}
            </dl>

            {/* The rounds, chronologically */}
            <section className="mt-12">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--forest)]">
                The rounds
              </h2>
              <ol className="mt-4 flex flex-col">
                {annual.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-baseline gap-4 border-t border-[var(--line)] py-3 first:border-t-0"
                  >
                    <span className="w-28 shrink-0 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)] tabular-nums">
                      {formatDatePlayed(entry.datePlayed!)}
                    </span>
                    <Link
                      href={`/c/${entry.course.courseId}`}
                      className="flex-1 font-[family-name:var(--font-display)] text-[15px] text-[var(--ink)] underline-offset-4 hover:text-[var(--brass-deep)] hover:underline"
                    >
                      {courseTitle(entry.course)}
                    </Link>
                    {entry.bestScore !== null && (
                      <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)] tabular-nums">
                        {entry.bestScore}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
