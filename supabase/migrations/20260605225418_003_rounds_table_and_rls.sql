-- ============================================================================
-- 003 — Multiple rounds per course (header/detail split), EXPAND step.
--
-- course_entries becomes the header (one per user+course: status + a course-level
-- note). A new `rounds` table holds the detail: each individual play of a course
-- (date, score, optional note). This is the EXPAND half of an expand/contract
-- migration — course_entries.date_played/best_score are intentionally LEFT IN
-- PLACE here so the currently-deployed app keeps working; they're dropped in 004
-- once the new code (which reads rounds) has shipped and verified green.
--
-- Design (locked 2026-06-05): normalized rounds table (not jsonb); friend
-- visibility MIRRORS the course_entries follower-gate exactly; a "played" course
-- may have zero rounds. Course-level date/score/best become derived from rounds.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TABLE
-- ---------------------------------------------------------------------------
-- user_id and course_id are denormalized from the parent entry. Both are
-- immutable for the life of an entry (an entry never changes owner or course),
-- so there's nothing to keep in sync: user_id powers the RLS gate without a
-- join, course_id lets round-level queries (most-played, The Annual) hit
-- course_cache directly. The insert policy enforces that both match the parent.
create table if not exists public.rounds (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.course_entries(id) on delete cascade,
  user_id     uuid not null references public.profiles(id)       on delete cascade,
  course_id   text not null references public.course_cache(course_id),
  date_played date,
  score       int,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rounds_score_range check (score is null or (score >= 1 and score <= 300))
);

-- Indexes: RLS gate column (user_id), parent lookups (entry_id), and the
-- course/date axes round-level stats query on.
create index if not exists rounds_entry_id_idx   on public.rounds (entry_id);
create index if not exists rounds_user_id_idx     on public.rounds (user_id);
create index if not exists rounds_course_id_idx   on public.rounds (course_id);
create index if not exists rounds_user_date_idx   on public.rounds (user_id, date_played);

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses public.set_updated_at from migration 002)
-- ---------------------------------------------------------------------------
drop trigger if exists rounds_set_updated_at on public.rounds;
create trigger rounds_set_updated_at
before update on public.rounds
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — mirrors course_entries (migration 002) exactly.
-- ---------------------------------------------------------------------------
alter table public.rounds enable row level security;

drop policy if exists rounds_select on public.rounds;
drop policy if exists rounds_insert on public.rounds;
drop policy if exists rounds_update on public.rounds;
drop policy if exists rounds_delete on public.rounds;

-- Read: owner, OR (owner shares AND viewer follows owner). Same gate as
-- entries_select, keyed on the denormalized user_id.
create policy rounds_select on public.rounds
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.profiles p
        where p.id = rounds.user_id and p.is_shared
      )
      and exists (
        select 1 from public.follows f
        where f.followee_id = rounds.user_id
          and f.follower_id = (select auth.uid())
      )
    )
  );

-- Insert: you may only attach a round to YOUR OWN entry, and the denormalized
-- user_id/course_id must match that parent entry (keeps the denormalization honest).
create policy rounds_insert on public.rounds
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.course_entries e
      where e.id = rounds.entry_id
        and e.user_id = (select auth.uid())
        and e.course_id = rounds.course_id
    )
  );

create policy rounds_update on public.rounds
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy rounds_delete on public.rounds
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- BACKFILL — one round per existing entry that recorded a play (date or score).
-- Preserve the entry's created_at so chronological ordering stays stable; the
-- entry's course-level note stays on the entry (notes here are round-agnostic).
-- Entries with neither a date nor a score (incl. all upcoming/bucket_list, and
-- "played but undated") get zero rounds — exactly the zero-round case we allow.
-- ---------------------------------------------------------------------------
insert into public.rounds (entry_id, user_id, course_id, date_played, score, created_at)
select id, user_id, course_id, date_played, best_score, created_at
from public.course_entries
where date_played is not null or best_score is not null;
