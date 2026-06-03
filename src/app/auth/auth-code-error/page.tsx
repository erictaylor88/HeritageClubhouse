import Link from "next/link";

export default function AuthCodeError() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--forest)]">
        That link didn&apos;t work
      </h1>
      <p className="max-w-sm text-[var(--ink-muted)]">
        Your sign-in link may have expired or already been used. Request a fresh
        one and try again.
      </p>
      <Link
        href="/login"
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-[var(--forest-mid)]"
      >
        Back to sign in
      </Link>
    </main>
  );
}
