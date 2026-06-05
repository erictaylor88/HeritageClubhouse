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
  // Rounds only adds signal once a course has been played more than once
  // (otherwise it just equals the played count).
  if (stats.rounds > stats.played)
    cells.push({ label: stats.rounds === 1 ? "Round" : "Rounds", value: stats.rounds });
  if (stats.upcoming > 0) cells.push({ label: "Upcoming", value: stats.upcoming });
  if (stats.bucketList > 0)
    cells.push({ label: "Bucket list", value: stats.bucketList });
  cells.push({ label: stats.states === 1 ? "State" : "States", value: stats.states });
  if (stats.countries > 1)
    cells.push({ label: "Countries", value: stats.countries });

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 ${className}`}
    >
      <dl className="flex flex-wrap gap-x-6 gap-y-3">
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
      {stats.mostPlayed && (
        <p className="border-t border-[var(--line)] pt-2 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Most played ·{" "}
          <span className="text-[var(--ink)]">{stats.mostPlayed.title}</span>{" "}
          ({stats.mostPlayed.count}×)
        </p>
      )}
    </div>
  );
}
