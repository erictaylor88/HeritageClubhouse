/**
 * Scorecard types + a defensive parser over `course_cache.raw`.
 *
 * No server-only deps — safe to import into client components. `raw` is the full
 * GolfCourseAPI detail payload (verified shape, 2026-06-05):
 *   raw.tees.{male,female}[] = {
 *     tee_name, course_rating, slope_rating, bogey_rating,
 *     total_yards, total_meters, number_of_holes, par_total,
 *     front_/back_ ratings, holes: [{ par, yardage, handicap }]  // 18, no hole #
 *   }
 * Search-result rows lack `tees` entirely (and are tagged raw.source ===
 * 'search-result'), which is how we detect a course still needs enrichment.
 */

export type ScorecardHole = {
  /** 1-based; derived from array position (the API holes have no number). */
  number: number;
  par: number | null;
  yardage: number | null;
  handicap: number | null;
};

export type ScorecardTee = {
  teeName: string;
  gender: "male" | "female";
  courseRating: number | null;
  slopeRating: number | null;
  bogeyRating: number | null;
  totalYards: number | null;
  parTotal: number | null;
  numberOfHoles: number | null;
  holes: ScorecardHole[];
};

export type Scorecard = {
  tees: ScorecardTee[];
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Whether a cached `raw` payload has already been enriched via the detail call.
 * Detection is the presence of the `tees` object — NOT whether it parses to a
 * usable scorecard. A detail fetch always returns a `tees` object (even if its
 * arrays are sparse), so this prevents re-fetching courses with thin tee data
 * and burning the 50/day cap. Search-result rows have no `tees` key → not
 * enriched.
 */
export function isEnriched(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const tees = (raw as Record<string, unknown>).tees;
  return tees != null && typeof tees === "object";
}

function parseTee(record: unknown, gender: "male" | "female"): ScorecardTee | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;

  const holesRaw = Array.isArray(r.holes) ? r.holes : [];
  const holes: ScorecardHole[] = holesRaw.map((h, i) => {
    const hr = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
    return {
      number: i + 1,
      par: num(hr.par),
      yardage: num(hr.yardage),
      handicap: num(hr.handicap),
    };
  });

  const teeName =
    typeof r.tee_name === "string" && r.tee_name.trim() !== ""
      ? r.tee_name.trim()
      : "Tee";

  return {
    teeName,
    gender,
    courseRating: num(r.course_rating),
    slopeRating: num(r.slope_rating),
    bogeyRating: num(r.bogey_rating),
    totalYards: num(r.total_yards),
    parTotal: num(r.par_total),
    numberOfHoles: num(r.number_of_holes),
    holes,
  };
}

/**
 * Parse a cached `raw` payload into a typed scorecard, or null if there's no
 * usable tee/hole data. Only tees with at least one hole are kept.
 */
export function parseScorecard(raw: unknown): Scorecard | null {
  if (!raw || typeof raw !== "object") return null;
  const teesObj = (raw as Record<string, unknown>).tees;
  if (!teesObj || typeof teesObj !== "object") return null;

  const t = teesObj as Record<string, unknown>;
  const tees: ScorecardTee[] = [];
  for (const gender of ["male", "female"] as const) {
    const arr = t[gender];
    if (!Array.isArray(arr)) continue;
    for (const rec of arr) {
      const parsed = parseTee(rec, gender);
      if (parsed && parsed.holes.length > 0) tees.push(parsed);
    }
  }

  return tees.length > 0 ? { tees } : null;
}

/**
 * Index of the "primary" tee to show by default: the longest (championship)
 * tee, preferring men's on a tie. Returns 0 for a single/empty list.
 */
export function defaultTeeIndex(tees: ScorecardTee[]): number {
  if (tees.length <= 1) return 0;
  let best = 0;
  let bestYards = -1;
  tees.forEach((tee, i) => {
    const yards = tee.totalYards ?? -1;
    const better =
      yards > bestYards ||
      (yards === bestYards &&
        tee.gender === "male" &&
        tees[best].gender === "female");
    if (better) {
      best = i;
      bestYards = yards;
    }
  });
  return best;
}
