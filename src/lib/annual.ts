/**
 * "The Annual" — a year-in-review over a user's course entries. Pure +
 * client-safe (no server deps), like {@link computeStats}. FREE tier: keyed on
 * `date_played`, which we already store — no GolfCourseAPI enrichment needed.
 *
 * Each user has at most one entry per course (DB-unique on user+course), so a
 * year's "played" set is the courses whose entry carries a `date_played` in that
 * year. Entries without a play date can't be placed in a year and are excluded —
 * that's the whole reason play-date backfill gated this feature.
 */

import { courseTitle, type CourseEntry } from "@/lib/courses";
import { computeStats } from "@/lib/stats";

export type Annual = {
  year: number;
  /** Courses marked played with a date in this year (== entries.length). */
  courses: number;
  /** Distinct US states across this year's courses. */
  states: number;
  /** Distinct countries across this year's courses. */
  countries: number;
  /** This year's played entries, chronological (earliest first). */
  entries: CourseEntry[];
  /** Earliest and latest course played this year, for the recap line. */
  first: { title: string; date: string } | null;
  last: { title: string; date: string } | null;
};

/** Parse the year out of a stored `date_played` (YYYY-MM-DD); null if absent. */
export function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  return Number.isInteger(y) && y >= 1900 ? y : null;
}

/** Descending list of years that have at least one played round with a date. */
export function availableYears(entries: CourseEntry[]): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    if (e.status !== "played") continue;
    const y = yearOf(e.datePlayed);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export function computeAnnual(entries: CourseEntry[], year: number): Annual {
  const yearEntries = entries
    .filter((e) => e.status === "played" && yearOf(e.datePlayed) === year)
    // datePlayed is a non-null ISO string here (filtered above); ISO sorts lexically.
    .sort((a, b) => (a.datePlayed! < b.datePlayed! ? -1 : a.datePlayed! > b.datePlayed! ? 1 : 0));

  // Reuse the address parsing in computeStats over just this year's subset.
  const { states, countries } = computeStats(yearEntries);

  const toMark = (e: CourseEntry) => ({
    title: courseTitle(e.course),
    date: e.datePlayed!,
  });

  return {
    year,
    courses: yearEntries.length,
    states,
    countries,
    entries: yearEntries,
    first: yearEntries.length ? toMark(yearEntries[0]) : null,
    last: yearEntries.length ? toMark(yearEntries[yearEntries.length - 1]) : null,
  };
}
