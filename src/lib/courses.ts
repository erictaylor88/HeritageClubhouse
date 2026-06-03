/**
 * Shared course-entry constants and types (no server-only deps — safe to import
 * into client components). The status enum is fixed and mirrors the DB CHECK
 * constraint: played | upcoming | bucket_list.
 */

export const COURSE_STATUSES = ["played", "upcoming", "bucket_list"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const STATUS_META: Record<
  CourseStatus,
  { label: string; cssVar: string }
> = {
  played: { label: "Played", cssVar: "--status-played" },
  upcoming: { label: "Upcoming", cssVar: "--status-upcoming" },
  bucket_list: { label: "Bucket list", cssVar: "--status-bucket" },
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
