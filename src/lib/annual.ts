/**
 * "The Annual" — a year-in-review over a user's recorded rounds. Pure +
 * client-safe (no server deps), like {@link computeStats}. FREE tier: keyed on
 * each round's `date_played`, which we already store — no GolfCourseAPI
 * enrichment needed.
 *
 * A year's set is every ROUND whose `date_played` falls in that year (not every
 * entry) — so a course played three times in a year shows three lines. Rounds
 * without a date can't be placed in a year and are excluded; courses with no
 * rounds (incl. upcoming/bucket_list) never appear.
 */

import { courseTitle, type CourseEntry } from "@/lib/courses";
import { computeStats } from "@/lib/stats";

/** One dated play, flattened with its course context for the recap list. */
export type AnnualRound = {
  /** Stable React key — the round's id. */
  id: string;
  courseId: string;
  title: string;
  /** Non-null ISO date (YYYY-MM-DD); only dated rounds reach this type. */
  date: string;
  score: number | null;
};

export type Annual = {
  year: number;
  /** This year's dated rounds, chronological (earliest first). */
  rounds: AnnualRound[];
  /** Total rounds played this year (== rounds.length). */
  roundCount: number;
  /** Distinct courses played this year. */
  courses: number;
  /** Distinct US states across this year's courses. */
  states: number;
  /** Distinct countries across this year's courses. */
  countries: number;
  /** Earliest and latest round played this year, for the recap line. */
  first: AnnualRound | null;
  last: AnnualRound | null;
};

/** Parse the year out of a stored `date_played` (YYYY-MM-DD); null if absent. */
export function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  return Number.isInteger(y) && y >= 1900 ? y : null;
}

/** Descending list of years that have at least one dated round. */
export function availableYears(entries: CourseEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    for (const r of e.rounds) {
      const y = yearOf(r.datePlayed);
      if (y) years.add(y);
    }
  }
  return [...years].sort((a, b) => b - a);
}

export function computeAnnual(entries: CourseEntry[], year: number): Annual {
  const rounds: AnnualRound[] = [];
  // Track which entries contributed a round this year, to count distinct
  // courses + reuse the address parsing in computeStats over just that subset.
  const courseEntries = new Map<string, CourseEntry>();

  for (const entry of entries) {
    let contributed = false;
    for (const r of entry.rounds) {
      if (yearOf(r.datePlayed) !== year) continue;
      rounds.push({
        id: r.id,
        courseId: entry.course.courseId,
        title: courseTitle(entry.course),
        date: r.datePlayed!, // non-null: yearOf returned a year
        score: r.score,
      });
      contributed = true;
    }
    if (contributed) courseEntries.set(entry.course.courseId, entry);
  }

  // Chronological; ISO dates sort lexically. Ties keep insertion order.
  rounds.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const { states, countries } = computeStats([...courseEntries.values()]);

  return {
    year,
    rounds,
    roundCount: rounds.length,
    courses: courseEntries.size,
    states,
    countries,
    first: rounds.length ? rounds[0] : null,
    last: rounds.length ? rounds[rounds.length - 1] : null,
  };
}
