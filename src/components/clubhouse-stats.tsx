import type { ClubhouseStats } from "@/lib/stats";

/**
 * "Clubhouse in numbers" — a compact row of headline stats. Presentational and
 * server-safe (no hooks). Renders nothing when there are no courses; shows only
 * the cells that carry signal (upcoming/bucket when > 0, countries when > 1).
 */
export function ClubhouseStats({
  stats,
  className = "",
}: {
  stats: ClubhouseStats;
  className?: string;
}) {
  if (stats.total === 0) return null;

  const cells: { label: string; value: number }[] = [
    { label: stats.total === 1 ? "Course" : "Courses", value: stats.total },
    { label: "Played", value: stats.played },
  ];
  if (stats.upcoming > 0) cells.push({ label: "Upcoming", value: stats.upcoming });
  if (stats.bucketList > 0)
    cells.push({ label: "Bucket list", value: stats.bucketList });
  cells.push({ label: stats.states === 1 ? "State" : "States", value: stats.states });
  if (stats.countries > 1)
    cells.push({ label: "Countries", value: stats.countries });

  return (
    <dl
      className={`flex flex-wrap gap-x-6 gap-y-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 ${className}`}
    >
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col">
          <dt className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            {cell.label}
          </dt>
          <dd className="font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
