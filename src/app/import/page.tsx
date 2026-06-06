import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportWorkspace } from "@/components/import/import-workspace";

/**
 * Round-import page. Auth-gated (defense-in-depth behind the proxy). The heavy
 * lifting is the client {@link ImportWorkspace}: it parses the upload locally,
 * matches courses against the cache, and walks the user through confirming the
 * rest one search at a time (respecting the 50/day cap).
 */
export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="hc-grain flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5">
        <span className="flex flex-col">
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--forest)]">
            Heritage Clubhouse
          </span>
          <span className="hc-rule mt-0.5 w-full" />
        </span>
        <Link
          href="/map"
          className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)] transition-colors hover:text-[var(--forest)]"
        >
          ← Back to map
        </Link>
      </header>

      <main className="hc-grain mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.16em] text-[var(--brass-deep)]">
          Round import
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
          Import rounds from 18Birdies
        </h1>
        <p className="mt-2 max-w-prose text-sm text-[var(--ink-muted)]">
          Upload your 18Birdies data export (a <code>.json</code> file). We&apos;ll
          match each course to the map — courses already on file match instantly,
          and you can search for the rest. Re-importing is safe: rounds you already
          have won&apos;t be added twice.
        </p>

        <div className="mt-8">
          <ImportWorkspace />
        </div>
      </main>
    </div>
  );
}
