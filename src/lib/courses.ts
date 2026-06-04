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

/** A course the signed-in user has logged, joined to its cached coordinates. */
export type CourseEntry = {
  id: string;
  status: CourseStatus;
  datePlayed: string | null;
  bestScore: number | null;
  notes: string | null;
  course: {
    courseId: string;
    clubName: string | null;
    courseName: string | null;
    address: string | null;
    lat: number;
    lng: number;
  };
};

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

/** A human label for a course, falling back gracefully across the name fields. */
export function courseTitle(course: {
  clubName: string | null;
  courseName: string | null;
}): string {
  const club = course.clubName?.trim();
  const name = course.courseName?.trim();
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
