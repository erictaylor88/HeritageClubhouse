-- ============================================================================
-- 002 — course_entries DB-level hardening + RLS policy optimization
--
-- (1) Move two invariants the server action enforced into the schema:
--     - updated_at is bumped automatically on every UPDATE (trigger)
--     - best_score is constrained to the validated range (CHECK)
-- (2) Collapse the multiple-permissive-SELECT-policy pattern flagged by the
--     performance advisor: merge owner-read + follower-read into ONE select
--     policy and split the owner FOR ALL into explicit write-only policies,
--     on course_entries and follows. Semantics are preserved exactly
--     (verified by second-user impersonation tests before + after).
-- ============================================================================

-- (1a) Generic updated_at trigger. search_path pinned empty to satisfy the
--      function_search_path_mutable advisor; now() resolves from pg_catalog.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists course_entries_set_updated_at on public.course_entries;
create trigger course_entries_set_updated_at
before update on public.course_entries
for each row
execute function public.set_updated_at();

-- (1b) best_score range — matches the server action (nullable, else 1..300).
alter table public.course_entries
  drop constraint if exists course_entries_best_score_range;
alter table public.course_entries
  add constraint course_entries_best_score_range
  check (best_score is null or (best_score >= 1 and best_score <= 300));

-- (2a) course_entries: one SELECT policy (owner OR shared+followed), plus
--      owner-only write policies. Replaces entries_owner_all + entries_follower_read.
drop policy if exists entries_owner_all on public.course_entries;
drop policy if exists entries_follower_read on public.course_entries;

create policy entries_select on public.course_entries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.profiles p
        where p.id = course_entries.user_id and p.is_shared
      )
      and exists (
        select 1 from public.follows f
        where f.followee_id = course_entries.user_id
          and f.follower_id = (select auth.uid())
      )
    )
  );

create policy entries_insert on public.course_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy entries_update on public.course_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy entries_delete on public.course_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- (2b) follows: one SELECT policy (either side of the edge), plus owner-only
--      insert/delete (the app never UPDATEs a follow row).
drop policy if exists follows_owner_all on public.follows;
drop policy if exists follows_visible on public.follows;

create policy follows_select on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
  );

create policy follows_insert on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));

create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));
