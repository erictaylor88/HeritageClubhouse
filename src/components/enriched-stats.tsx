import {
  hasEnrichedStats,
  yardsToMiles,
  type EnrichedStats as EnrichedStatsData,
} from "@/lib/enriched-stats";

/**
 * "On the card" — enriched stats derived from scorecard tee data. Renders
 * nothing until at least one played course has been enriched, and footnotes its
 * coverage so a partial picture never reads as the whole. Presentational +
 * server-safe (no hooks), like {@link ClubhouseStats}.
 */
export function EnrichedStats({
  stats,
  className = "",
}: {
  stats: EnrichedStatsData;
  className?: string;
}) {
  if (!hasEnrichedStats(stats)) return null;

  const rows: { label: string; context: string; value: string; unit: string }[] =
    [];
  if (stats.toughest)
    rows.push({
      label: "Toughest",
      context: stats.toughest.title,
      value: String(stats.toughest.slope),
      unit: "slope",
    });
  if (stats.longest)
    rows.push({
      label: "Longest",
      context: stats.longest.title,
      value: stats.longest.yards.toLocaleString(),
      unit: "yds",
    });
  if (stats.totalYards > 0)
    rows.push({
      label: "Walked",
      context: `across ${stats.distanceRounds} ${
        stats.distanceRounds === 1 ? "round" : "rounds"
      }`,
      value: String(yardsToMiles(stats.totalYards)),
      unit: "mi",
    });

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 ${className}`}
    >
      <p className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.16em] text-[var(--brass-deep)]">
        On the card
      </p>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0"
          >
            <dt className="flex min-w-0 flex-col">
              <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                {row.label}
              </span>
              <span className="truncate font-[family-name:var(--font-display)] text-[15px] text-[var(--ink)]">
                {row.context}
              </span>
            </dt>
            <dd className="shrink-0 font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--forest)]">
              {row.value}
              <span className="ml-1 font-[family-name:var(--font-mono)] text-[0.65rem] font-normal uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                {row.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="font-[family-name:var(--font-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        From {stats.enrichedCount} of {stats.playedTotal} played{" "}
        {stats.playedTotal === 1 ? "course" : "courses"} with scorecard data
      </p>
    </div>
  );
}
