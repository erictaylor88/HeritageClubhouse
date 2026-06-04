import Link from "next/link";

export default function ClubhouseNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Members only
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--forest)]">
          This clubhouse is private
        </h1>
        <div className="mx-auto mt-5 h-px w-24 bg-[var(--brass-bright)]/60" />
        <p className="mt-5 text-lg leading-relaxed text-[var(--ink-muted)]">
          This map either doesn&apos;t exist or isn&apos;t being shared right
          now.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-[var(--forest-mid)]"
          >
            Heritage Clubhouse
          </Link>
        </div>
      </div>
    </main>
  );
}
