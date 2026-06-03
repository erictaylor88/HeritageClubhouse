import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Proxy already gates this route; this is defense-in-depth.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.display_name ?? user.email ?? "there";

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

      {/* Empty map canvas placeholder (the real Leaflet map lands in P1) */}
      <main className="relative flex flex-1 items-center justify-center bg-[var(--paper-sunk)] px-6">
        <div className="max-w-md text-center">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
            Welcome, {name}
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
            Your map is empty — for now
          </h1>
          <p className="mt-3 text-[var(--ink-muted)]">
            Course search and your first stamps arrive next. This is your signed-in
            home base.
          </p>
          <div className="mx-auto mt-6 flex items-center justify-center gap-5 text-sm text-[var(--ink-muted)]">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[var(--status-played)]" />
              Played
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[var(--status-upcoming)]" />
              Upcoming
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[var(--status-bucket)]" />
              Bucket list
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
