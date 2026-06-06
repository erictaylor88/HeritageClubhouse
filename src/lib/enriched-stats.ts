/**
 * Enriched "on the card" stats — derived from `course_cache.raw` tee data, which
 * is populated lazily as courses are deep-viewed (see {@link enrichCourse}). So
 * coverage is partial by design: these stats describe only the played courses
 * that have a scorecard yet, and report that coverage so the gap reads honestly.
 *
 * Pure + client-safe, like {@link computeStats}. The raw→summary parsing lives in
 * {@link primaryTeeSummary}; this module aggregates the per-course summaries.
 */

import { primaryTeeSummary } from "@/lib/golf/scorecard";

/** One enriched played course, with how many times the user has played it. */
export type EnrichedCourse = {
  title: string;
  /** Rounds the user has logged here (weights cumulative distance). */
  rounds: number;
  slope: number | null;
  courseRating: number | null;
  totalYards: number | null;
};

export type EnrichedStats = {
  /** Played courses that have scorecard data (the basis for these stats). */
  enrichedCount: number;
  /** Played courses total (enriched or not) — the coverage denominator. */
  playedTotal: number;
  /** Hardest course played, by slope. */
  toughest: { title: string; slope: number } | null;
  /** Longest course played, by championship-tee yardage. */
  longest: { title: string; yards: number } | null;
  /** Yards walked = sum of each enriched course's yardage × rounds there. */
  totalYards: number;
  /** Rounds counted toward {@link totalYards} (those on a yardage-known course). */
  distanceRounds: number;
};

const YARDS_PER_MILE = 1760;

/** Whether there's anything worth rendering (at least one enriched course). */
export function hasEnrichedStats(stats: EnrichedStats): boolean {
  return stats.enrichedCount > 0;
}

/** Yards → miles, one decimal. */
export function yardsToMiles(yards: number): number {
  return Math.round((yards / YARDS_PER_MILE) * 10) / 10;
}

/**
 * Build an {@link EnrichedCourse} from a cached `raw` payload, or null when the
 * course has no usable scorecard (not enriched yet).
 */
export function enrichedCourseFromRaw(
  title: string,
  rounds: number,
  raw: unknown,
): EnrichedCourse | null {
  const summary = primaryTeeSummary(raw);
  if (!summary) return null;
  return {
    title,
    rounds,
    slope: summary.slopeRating,
    courseRating: summary.courseRating,
    totalYards: summary.totalYards,
  };
}

export function computeEnrichedStats(
  courses: EnrichedCourse[],
  playedTotal: number,
): EnrichedStats {
  let toughest: { title: string; slope: number } | null = null;
  let longest: { title: string; yards: number } | null = null;
  let totalYards = 0;
  let distanceRounds = 0;

  for (const c of courses) {
    if (c.slope !== null && (toughest === null || c.slope > toughest.slope)) {
      toughest = { title: c.title, slope: c.slope };
    }
    if (
      c.totalYards !== null &&
      (longest === null || c.totalYards > longest.yards)
    ) {
      longest = { title: c.title, yards: c.totalYards };
    }
    if (c.totalYards !== null && c.rounds > 0) {
      totalYards += c.totalYards * c.rounds;
      distanceRounds += c.rounds;
    }
  }

  return {
    enrichedCount: courses.length,
    playedTotal,
    toughest,
    longest,
    totalYards,
    distanceRounds,
  };
}
