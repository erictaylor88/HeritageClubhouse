/**
 * Round-import pipeline types. No server-only deps — safe to import into both the
 * client review UI and the server actions. One adapter per source produces a
 * {@link ParsedImport}; the UI matches each parsed course to a real course
 * (cache-first, then a user-paced search), then hands confirmed selections back
 * to the server for an idempotent write.
 *
 * Cap discipline (CLAUDE.md hard rule #3): parsing is client-side and free; cache
 * matching is a DB read (no API); only the user's deliberate searches hit
 * GolfCourseAPI, and importing a picked result reuses its coords (no detail call).
 */

import type { CourseSearchResult } from "@/lib/courses";

/** Supported import sources. Discriminator leaves room for future adapters. */
export type ImportSource = "18birdies";

/** One recorded play, normalized from a source's per-round record. */
export type ParsedRound = {
  /** Play date as YYYY-MM-DD (UTC), or null if the source lacked a timestamp. */
  datePlayed: string | null;
  /** Gross strokes for the holes played, or null if absent. */
  score: number | null;
  /** Holes played (9 or 18, typically). Drives the "(9 holes)" note annotation. */
  holeCount: number;
};

/** A distinct course from the source file, with all its parsed plays. */
export type ParsedCourse = {
  /** Stable per-source course id (e.g. 18Birdies clubId) — the row key. */
  sourceId: string;
  /** The course name as the source labelled it (shown in the review UI). */
  sourceName: string;
  rounds: ParsedRound[];
};

/** The full result of parsing one source export. */
export type ParsedImport = {
  source: ImportSource;
  courses: ParsedCourse[];
  totalRounds: number;
  /** Earliest/latest play date across all rounds (YYYY-MM-DD), for the summary. */
  dateRange: { from: string; to: string } | null;
};

/** A course_cache hit proposed for a parsed course, with match strength. */
export type CacheSuggestion = {
  course: CourseSearchResult;
  /** "exact" = normalized names match; "likely" = strong token overlap. */
  confidence: "exact" | "likely";
};

/**
 * One course the user has confirmed to import. `course` always carries coords
 * (it came from a cache row or a search result), so the server caches it via the
 * existing write-through with no detail API call.
 */
export type ConfirmedCourse = {
  sourceId: string;
  course: CourseSearchResult;
  rounds: ParsedRound[];
};

/** Per-course outcome of an import run. */
export type CourseImportResult = {
  sourceId: string;
  courseTitle: string;
  inserted: number;
  skipped: number;
  error?: string;
};

/** Aggregate outcome of an import run. */
export type ImportResult = {
  coursesImported: number;
  roundsInserted: number;
  roundsSkipped: number;
  perCourse: CourseImportResult[];
};
