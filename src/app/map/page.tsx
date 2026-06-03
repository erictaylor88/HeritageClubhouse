import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CourseSearch } from "@/components/course-search";
import { CourseList } from "@/components/course-list";
import { MapCanvas } from "@/components/map-canvas";
import { type CourseEntry, type CourseStatus } from "@/lib/courses";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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

export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy already gates this route; this is defense-in-depth.
  if (!user) redirect("/login");

  const [{ data: profile }, { data: entryRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("course_entries")
      .select(
        "id, status, date_played, best_score, notes, course_cache(course_id, club_name, course_name, address, lat, lng)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const name = profile?.display_name ?? user.email ?? "there";

  // Shape rows into the UI type, dropping any orphaned-cache rows defensively.
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

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5">
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--forest)]">
          Heritage Clubhouse
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <div className="flex flex-1 flex-col md:h-[calc(100dvh-3.5rem)] md:flex-row md:overflow-hidden">
        {/* Logbook panel: search + your courses */}
        <aside className="flex w-full flex-col gap-6 border-b border-[var(--line)] bg-[var(--paper)] p-5 md:w-[360px] md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
          <div>
            <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              Welcome, {name}
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--ink)]">
              Add a course
            </h1>
          </div>

          <CourseSearch />

          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-5">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--forest)]">
              Your courses
              {entries.length > 0 && (
                <span className="ml-2 font-[family-name:var(--font-mono)] text-xs font-normal text-[var(--ink-muted)]">
                  {entries.length}
                </span>
              )}
            </h2>
            <CourseList entries={entries} />
          </div>
        </aside>

        {/* Interactive map with status-colored stamp pins. */}
        <main className="relative h-[60vh] w-full md:h-auto md:flex-1">
          <MapCanvas entries={entries} />
        </main>
      </div>
    </div>
  );
}
