"use client";

import { useState } from "react";
import {
  defaultTeeIndex,
  type ScorecardHole,
  type ScorecardTee,
} from "@/lib/golf/scorecard";

/** Sum a hole field, skipping nulls. */
function sum(holes: ScorecardHole[], key: "par" | "yardage"): number {
  return holes.reduce((acc, h) => acc + (h[key] ?? 0), 0);
}

const GENDER_LABEL: Record<ScorecardTee["gender"], string> = {
  male: "M",
  female: "W",
};

/** A summary stat cell (rating / slope / yards / par). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--ink)]">
        {value}
      </span>
    </div>
  );
}

/** A nine-hole block: holes across, par/yards/handicap down, with a sub-total. */
function NineTable({
  holes,
  label,
  totalLabel,
}: {
  holes: ScorecardHole[];
  label: string;
  totalLabel: string;
}) {
  if (holes.length === 0) return null;
  const parOut = sum(holes, "par");
  const ydsOut = sum(holes, "yardage");

  const cell =
    "border border-[var(--line)] px-2.5 py-1.5 text-center tabular-nums whitespace-nowrap";
  const head =
    "border border-[var(--line)] px-2.5 py-1.5 text-center font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.1em] text-[var(--ink-muted)] whitespace-nowrap";

  return (
    <table className="border-collapse text-sm text-[var(--ink)]">
      <thead>
        <tr>
          <th className={`${head} text-left`}>{label}</th>
          {holes.map((h) => (
            <th key={h.number} className={head}>
              {h.number}
            </th>
          ))}
          <th className={`${head} bg-[var(--paper-sunk)]`}>{totalLabel}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th className={`${head} text-left`}>Par</th>
          {holes.map((h) => (
            <td key={h.number} className={cell}>
              {h.par ?? "—"}
            </td>
          ))}
          <td className={`${cell} bg-[var(--paper-sunk)] font-semibold`}>
            {parOut || "—"}
          </td>
        </tr>
        <tr>
          <th className={`${head} text-left`}>Yards</th>
          {holes.map((h) => (
            <td key={h.number} className={cell}>
              {h.yardage ?? "—"}
            </td>
          ))}
          <td className={`${cell} bg-[var(--paper-sunk)] font-semibold`}>
            {ydsOut || "—"}
          </td>
        </tr>
        <tr>
          <th className={`${head} text-left`}>Hcp</th>
          {holes.map((h) => (
            <td key={h.number} className={`${cell} text-[var(--ink-muted)]`}>
              {h.handicap ?? "—"}
            </td>
          ))}
          <td className={`${cell} bg-[var(--paper-sunk)]`} />
        </tr>
      </tbody>
    </table>
  );
}

export function Scorecard({ tees }: { tees: ScorecardTee[] }) {
  const [index, setIndex] = useState(() => defaultTeeIndex(tees));
  const tee = tees[index] ?? tees[0];
  if (!tee) return null;

  const front = tee.holes.slice(0, 9);
  const back = tee.holes.slice(9, 18);
  const totalYards = tee.totalYards ?? (sum(tee.holes, "yardage") || null);
  const totalPar = tee.parTotal ?? (sum(tee.holes, "par") || null);

  const fmt = (n: number | null, digits = 1) =>
    n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(digits);

  return (
    <div className="flex flex-col gap-5">
      {/* Tee selector */}
      {tees.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tees.map((t, i) => {
            const active = i === index;
            return (
              <button
                key={`${t.gender}-${t.teeName}-${i}`}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-[var(--brass)] bg-[var(--brass)]/15 text-[var(--brass-deep)]"
                    : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--brass)] hover:text-[var(--brass-deep)]"
                }`}
              >
                {t.teeName}
                <span className="ml-1.5 font-[family-name:var(--font-mono)] text-[0.6rem] uppercase opacity-70">
                  {GENDER_LABEL[t.gender]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected-tee summary */}
      <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <Stat label="Rating" value={fmt(tee.courseRating)} />
        <Stat
          label="Slope"
          value={tee.slopeRating === null ? "—" : String(tee.slopeRating)}
        />
        <Stat label="Bogey" value={fmt(tee.bogeyRating)} />
        <Stat
          label="Yards"
          value={totalYards === null ? "—" : totalYards.toLocaleString()}
        />
        <Stat label="Par" value={totalPar === null ? "—" : String(totalPar)} />
      </div>

      {/* Per-hole scorecard (scrolls horizontally on narrow screens) */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-fit flex-col gap-4">
          <NineTable holes={front} label="Front" totalLabel="Out" />
          <NineTable holes={back} label="Back" totalLabel="In" />
        </div>
      </div>
    </div>
  );
}
