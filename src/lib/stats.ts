/**
 * "Clubhouse in numbers" — derived stats over a user's course entries. Pure +
 * client-safe (no server deps). FREE tier: everything here comes from
 * `course_entries` + `course_cache` fields we already have (status, address) —
 * no GolfCourseAPI enrichment required. Enriched stats (toughest by slope,
 * total yardage) come later, gated on `course_cache.raw.tees`.
 */

import { courseTitle, type CourseEntry } from "@/lib/courses";

export type ClubhouseStats = {
  total: number;
  played: number;
  upcoming: number;
  bucketList: number;
  /** Distinct US state codes seen across course addresses. */
  states: number;
  /** Distinct countries seen across course addresses. */
  countries: number;
  /** Total recorded plays across every entry's rounds. */
  rounds: number;
  /** The most-played course and its play count, when any course has ≥ 2 rounds. */
  mostPlayed: { title: string; count: number } | null;
};

// GolfCourseAPI addresses are "..., CITY, ST 12345, USA|United States".
const STATE_RE = /,\s*([A-Z]{2})\s+\d{4,}/;
const STATE_ZIP_ONLY_RE = /^[A-Z]{2}\s+\d{4,}$/;
const US_NAMES = new Set([
  "USA",
  "US",
  "UNITED STATES",
  "UNITED STATES OF AMERICA",
]);

function extractState(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(STATE_RE);
  return m ? m[1] : null;
}

function extractCountry(address: string | null): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  // No country segment present (address ends in "ST 12345") → don't count it.
  if (STATE_ZIP_ONLY_RE.test(last)) return null;
  return US_NAMES.has(last.toUpperCase()) ? "United States" : last;
}

export function computeStats(entries: CourseEntry[]): ClubhouseStats {
  const states = new Set<string>();
  const countries = new Set<string>();
  let played = 0;
  let upcoming = 0;
  let bucketList = 0;
  let rounds = 0;
  let mostPlayed: { title: string; count: number } | null = null;

  for (const entry of entries) {
    if (entry.status === "played") played++;
    else if (entry.status === "upcoming") upcoming++;
    else if (entry.status === "bucket_list") bucketList++;

    rounds += entry.rounds.length;
    // Only surface a most-played course when it's been played more than once.
    if (entry.rounds.length >= 2 && entry.rounds.length > (mostPlayed?.count ?? 1)) {
      mostPlayed = { title: courseTitle(entry.course), count: entry.rounds.length };
    }

    const state = extractState(entry.course.address);
    if (state) states.add(state);
    const country = extractCountry(entry.course.address);
    if (country) countries.add(country);
  }

  return {
    total: entries.length,
    played,
    upcoming,
    bucketList,
    states: states.size,
    countries: countries.size,
    rounds,
    mostPlayed,
  };
}
