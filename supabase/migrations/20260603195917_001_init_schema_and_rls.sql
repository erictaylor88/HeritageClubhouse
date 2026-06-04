-- Heritage Clubhouse — initial schema + RLS
-- profiles, course_cache, course_entries, follows
-- RLS enabled on all four; policies created in-line (no unprotected window).

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text,
  is_shared    boolean not null default false,
  share_slug   text unique,                 -- public share URL token; null until shared
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.course_cache (
  course_id   text primary key,             -- GolfCourseAPI id (as text)
  club_name   text,
  course_name text,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  raw         jsonb,                         -- full API payload (tees, ratings) for future use
  cached_at   timestamptz not null default now()
);

create table if not exists public.course_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   text not null references public.course_cache(course_id),
  status      text not null check (status in ('played','upcoming','bucket_list')),
  date_played date,
  best_score  int,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, course_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ---------------------------------------------------------------------------
-- INDEXES (RLS policy columns + map queries)
-- ---------------------------------------------------------------------------

create index if not exists course_entries_user_id_idx  on public.course_entries (user_id);
create index if not exists course_entries_course_id_idx on public.course_entries (course_id);
create index if not exists follows_followee_id_idx      on public.follows (followee_id);
create index if not exists follows_follower_id_idx      on public.follows (follower_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.course_cache   enable row level security;
alter table public.course_entries enable row level security;
alter table public.follows        enable row level security;

-- PROFILES -----------------------------------------------------------------
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;

-- authenticated users can read profiles (to discover/follow people)
create policy profiles_read on public.profiles
  for select to authenticated using (true);
-- a user manages only their own profile
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- COURSE_ENTRIES -----------------------------------------------------------
drop policy if exists entries_owner_all     on public.course_entries;
drop policy if exists entries_follower_read on public.course_entries;

-- owner: full access
create policy entries_owner_all on public.course_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- follower-gated read: owner shares AND viewer follows owner
create policy entries_follower_read on public.course_entries
  for select to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = course_entries.user_id and p.is_shared)
    and exists (select 1 from public.follows f
                where f.followee_id = course_entries.user_id
                  and f.follower_id = (select auth.uid()))
  );
-- NOTE: no anon/public policy. Public share page reads via service role only.

-- FOLLOWS ------------------------------------------------------------------
drop policy if exists follows_owner_all on public.follows;
drop policy if exists follows_visible   on public.follows;

-- you manage your own follow rows
create policy follows_owner_all on public.follows
  for all to authenticated
  using (follower_id = (select auth.uid()))
  with check (follower_id = (select auth.uid()));
-- you can see rows where you're follower or followee
create policy follows_visible on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

-- COURSE_CACHE -------------------------------------------------------------
drop policy if exists cache_read on public.course_cache;

-- authenticated read; writes happen only via service role (bypasses RLS).
-- No insert/update/delete policy -> only the service-role server route can write.
create policy cache_read on public.course_cache
  for select to authenticated using (true);
