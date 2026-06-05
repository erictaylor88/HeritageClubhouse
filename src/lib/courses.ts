/**
 * Shared course-entry constants and types (no server-only deps — safe to import
 * into client components). The status enum is fixed and mirrors the DB CHECK
 * constraint: played | upcoming | bucket_list.
 */

export const COURSE_STATUSES = ["played", "upcoming", "bucket_list"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

/**
 * Per-status display metadata. `ring` encodes status redundantly with color
 * (design spec §9): a CSS border-style that reads even without color —
 * solid = played, dashed = upcoming, dotted = bucket.
 */
export const STATUS_META: Record<
  CourseStatus,
  { label: string; cssVar: string; ring: "solid" | "dashed" | "dotted" }
> = {
  played: { label: "Played", cssVar: "--status-played", ring: "solid" },
  upcoming: { label: "Upcoming", cssVar: "--status-upcoming", ring: "dashed" },
  bucket_list: {
    label: "Bucket list",
    cssVar: "--status-bucket",
    ring: "dotted",
  },
};

export function isCourseStatus(value: unknown): value is CourseStatus {
  return (
    typeof value === "string" &&
    (COURSE_STATUSES as readonly string[]).includes(value)
  );
}

/** A single search result as returned by /api/courses/search. */
export type CourseSearchResult = {
  courseId: string;
  clubName: string | null;
  courseName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * One recorded play of a course — the detail half of the header/detail split.
 * A course (entry) can hold many; a "played" course may also hold zero.
 */
export type Round = {
  id: string;
  datePlayed: string | null;
  score: number | null;
  notes: string | null;
};

/**
 * A course the signed-in user has logged, joined to its cached coordinates. The
 * entry is the *header* (status + a course-level note); individual plays live in
 * {@link rounds}. Course-level date/score are derived from rounds, never stored
 * (see {@link lastPlayed}, {@link bestScore}, {@link roundCount}).
 */
export type CourseEntry = {
  id: string;
  status: CourseStatus;
  notes: string | null;
  rounds: Round[];
  course: {
    courseId: string;
    clubName: string | null;
    courseName: string | null;
    address: string | null;
    lat: number;
    lng: number;
  };
};

/** Total number of recorded plays for an entry. */
export function roundCount(entry: CourseEntry): number {
  return entry.rounds.length;
}

/** Most recent play date across an entry's rounds (ISO string), or null. */
export function lastPlayed(entry: CourseEntry): string | null {
  let latest: string | null = null;
  for (const r of entry.rounds) {
    if (r.datePlayed && (latest === null || r.datePlayed > latest)) {
      latest = r.datePlayed;
    }
  }
  return latest;
}

/** Lowest (best) score across an entry's rounds, or null if none recorded. */
export function bestScore(entry: CourseEntry): number | null {
  let best: number | null = null;
  for (const r of entry.rounds) {
    if (r.score !== null && (best === null || r.score < best)) best = r.score;
  }
  return best;
}

/** An entry's rounds, newest play first; undated rounds sort to the end. */
export function roundsByDateDesc(rounds: Round[]): Round[] {
  return [...rounds].sort((a, b) => {
    if (a.datePlayed === b.datePlayed) return 0;
    if (a.datePlayed === null) return 1;
    if (b.datePlayed === null) return -1;
    return a.datePlayed > b.datePlayed ? -1 : 1;
  });
}

/**
 * The raw shape of a `course_entries` row joined to `course_cache` and `rounds`,
 * as returned by Supabase. Shared across every read path (owner map, friend
 * overlay, public profile, The Annual) so the row→{@link CourseEntry} shaping
 * lives in one place. `rounds` is optional: callers that don't need play detail
 * (e.g. friend map pins) omit it and get an empty array.
 */
export type EntryRow = {
  id: string;
  status: string;
  notes: string | null;
  course_cache: {
    course_id: string;
    club_name: string | null;
    course_name: string | null;
    address: string | null;
    lat: number;
    lng: number;
  } | null;
  rounds?:
    | {
        id: string;
        date_played: string | null;
        score: number | null;
        notes: string | null;
      }[]
    | null;
};

/** Shape one row into a {@link CourseEntry}, or null if its cache row is missing. */
export function rowToCourseEntry(row: EntryRow): CourseEntry | null {
  if (!row.course_cache) return null;
  return {
    id: row.id,
    status: row.status as CourseStatus,
    notes: row.notes,
    rounds: (row.rounds ?? []).map((r) => ({
      id: r.id,
      datePlayed: r.date_played,
      score: r.score,
      notes: r.notes,
    })),
    course: {
      courseId: row.course_cache.course_id,
      clubName: row.course_cache.club_name,
      courseName: row.course_cache.course_name,
      address: row.course_cache.address,
      lat: row.course_cache.lat,
      lng: row.course_cache.lng,
    },
  };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Format a stored `date_played` (YYYY-MM-DD) for display without timezone drift.
 * Parsing the string via `new Date()` would shift it a day in negative offsets,
 * so we split the parts directly.
 */
export function formatDatePlayed(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * GolfCourseAPI abbreviates trailing words inconsistently ("Old Greenwood Gc",
 * "Pebble Beach Gl"). Expand the confident, unambiguous ones at display time —
 * the cache itself stays a faithful write-through of the API (architecture).
 */
const NAME_EXPANSIONS: Record<string, string> = {
  gc: "Golf Club",
  cc: "Country Club",
  gl: "Golf Links",
  "g&cc": "Golf & Country Club",
};

/** Clean a raw API name for display: trim, collapse spaces, expand abbrevs. */
export function cleanCourseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => NAME_EXPANSIONS[word.toLowerCase()] ?? word)
    .join(" ");
}

/** A human label for a course, falling back gracefully across the name fields. */
export function courseTitle(course: {
  clubName: string | null;
  courseName: string | null;
}): string {
  const club = course.clubName ? cleanCourseName(course.clubName) : "";
  const name = course.courseName ? cleanCourseName(course.courseName) : "";
  if (club && name && club !== name) return `${club} — ${name}`;
  return club || name || "Unnamed course";
}

/** First alphanumeric character of a course's name, for the stamp monogram. */
export function courseMonogram(course: {
  clubName: string | null;
  courseName: string | null;
}): string {
  const match = courseTitle(course).match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : "•";
}
