# Supabase migrations

Version-controlled record of the schema. These files are **exact mirrors** of the
migrations applied to the remote Supabase project (`pcwpjdxpmgvlzefycbrb`) — the
filename's leading 14-digit timestamp matches the remote
`supabase_migrations.schema_migrations.version`, so the CLI treats them as the
already-applied history.

| File | Applied | What it does |
|------|---------|--------------|
| `20260603195917_001_init_schema_and_rls.sql` | 2026-06-03 | Tables (`profiles`, `course_cache`, `course_entries`, `follows`), indexes, RLS enabled + policies. |
| `20260604051718_002_entries_constraints_and_rls_optimization.sql` | 2026-06-04 | `set_updated_at()` trigger on `course_entries`, `best_score` CHECK (1–300), and RLS collapsed to one SELECT + write-only policies on `course_entries` + `follows`. |

## Notes

- **001 and 002 were authored and applied directly on the remote project** (via the
  Supabase MCP), then backfilled here for version history. They were not run from
  this directory.
- Re-running both in order reproduces the current schema: every statement is
  idempotent (`create table if not exists`, `drop policy if exists` before each
  `create policy`, `create or replace function`).
- New changes should go through `supabase migration new <name>` (or a new
  timestamped file here) and `supabase db push` once the project is linked
  (`supabase link --project-ref pcwpjdxpmgvlzefycbrb`) — never ad-hoc SQL.
