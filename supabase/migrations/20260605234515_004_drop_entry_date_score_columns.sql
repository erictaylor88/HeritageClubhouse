-- ============================================================================
-- 004 — Multiple rounds per course, CONTRACT step.
--
-- The new code (shipped + verified green on heritageclubhouse.app) reads all
-- date/score data from the `rounds` table; course_entries.date_played and
-- best_score are now dead. Drop them, along with the best_score CHECK from
-- migration 002 (the equivalent range constraint now lives on rounds.score as
-- rounds_score_range). course_entries is now a pure header: status + course note.
-- ============================================================================

alter table public.course_entries
  drop constraint if exists course_entries_best_score_range;

alter table public.course_entries
  drop column if exists date_played,
  drop column if exists best_score;
