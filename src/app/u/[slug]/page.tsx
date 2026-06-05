import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { MapCanvas } from "@/components/map-canvas";
import { PublicCourseList } from "@/components/public-course-list";
import { ClubhouseStats } from "@/components/clubhouse-stats";
import { computeStats } from "@/lib/stats";
import { availableYears } from "@/lib/annual";
import { type CourseEntry, type CourseStatus } from "@/lib/courses";

// Always re-query so the share gate reflects the live `is_shared` flag — a map
// turned private must 404 immediately, never serve a stale cached copy.
export const dynamic = "force-dynamic";

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

/**
 * Look up a publicly-shared profile by slug. Uses the service-role admin client
 * (bypasses RLS) but is gated by `is_shared = true`, so an unshared or unknown
 * slug returns null → 404. Slugs are stored lowercase; normalize the param.
 * `cache()` dedupes the lookup between generateMetadata and the page render.
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getSharedProfile(slug);
  if (!profile) return { title: "Heritage Clubhouse" };
  const name = profile.display_name?.trim() || profile.username;
  const title = `${name}'s Clubhouse — Heritage Clubhouse`;
  const description = `${name}'s golf passport — the courses they've played, upcoming rounds, and bucket list.`;
  const url = `/u/${slug.toLowerCase()}`;
  // The OG/Twitter image is supplied by the colocated opengraph-image.tsx, which
  // Next merges into both cards automatically — no need to list it here.
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
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PublicMapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getSharedProfile(slug);
  if (!profile) notFound();

  const admin = createAdminClient();
  const { data: entryRows } = await admin
    .from("course_entries")
    .select(
      "id, status, date_played, best_score, notes, course_cache(course_id, club_name, course_name, address, lat, lng)",
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const entries: CourseEntry[] = ((entryRows ?? []) as unknown as EntryRow[])
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

  const name = profile.display_name?.trim() || profile.username;
  const latestAnnual = availableYears(entries)[0] ?? null;

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
          href="/login"
          className="text-sm font-medium text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--brass-deep)] hover:underline"
        >
          Start your own
        </Link>
      </header>

      <div className="flex flex-1 flex-col md:h-[calc(100dvh-3.5rem)] md:flex-row md:overflow-hidden">
        {/* Logbook panel: whose map + their courses. */}
        <aside className="hc-grain flex w-full flex-col gap-6 border-b border-[var(--line)] bg-[var(--paper)] p-5 md:w-[360px] md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
          <div>
            <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              A shared map
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--ink)]">
              {name}&apos;s Clubhouse
            </h1>
          </div>

          <ClubhouseStats stats={computeStats(entries)} />

          {latestAnnual && (
            <Link
              href={`/u/${slug.toLowerCase()}/${latestAnnual}`}
              className="group flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--brass)]"
            >
              <span className="flex flex-col">
                <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-[var(--brass-deep)]">
                  The Annual
                </span>
                <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--ink)]">
                  {latestAnnual} in golf
                </span>
              </span>
              <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--ink-muted)] transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          )}

          <div className="flex flex-col gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--forest)]">
              Courses
              {entries.length > 0 && (
                <span className="ml-2 font-[family-name:var(--font-mono)] text-xs font-normal text-[var(--ink-muted)]">
                  {entries.length}
                </span>
              )}
            </h2>
            <PublicCourseList entries={entries} />
          </div>
        </aside>

        {/* Interactive map with status-colored stamp pins (read-only). */}
        <main className="relative h-[60vh] w-full md:h-auto md:flex-1">
          <MapCanvas entries={entries} />
        </main>
      </div>
    </div>
  );
}
