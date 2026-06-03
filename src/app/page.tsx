import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/map");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="max-w-xl">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          A golf passport
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-[var(--forest)]">
          Heritage Clubhouse
        </h1>
        <div className="mx-auto mt-5 h-px w-24 bg-[var(--brass-bright)]/60" />
        <p className="mt-5 text-lg leading-relaxed text-[var(--ink-muted)]">
          A warm, paper-and-brass map of the courses you&apos;ve played, the
          rounds you have coming up, and the ones still on your list.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-[var(--forest-mid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Open your Clubhouse
          </Link>
        </div>
      </div>
    </main>
  );
}
