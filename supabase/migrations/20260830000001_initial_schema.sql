-- ============================================================================
-- 0001 — Foundations: extensions, shared helpers, profiles.
--
-- Conventions used by every later migration:
--   * Every user-owned table has `user_id uuid not null references auth.users`.
--   * Every user-owned table has RLS enabled with four explicit policies.
--   * `updated_at` is maintained by a trigger, never by the client.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger function that stamps updated_at on every UPDATE.';

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user, holding planning preferences.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) between 1 and 120),
  avatar_url text,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  week_starts_on smallint not null default 0 check (week_starts_on between 0 and 6),
  hour_cycle text not null default 'h12' check (hour_cycle in ('h12', 'h23')),
  default_task_minutes integer not null default 30
    check (default_task_minutes between 5 and 480),
  default_event_minutes integer not null default 60
    check (default_event_minutes between 5 and 480),
  -- [{ "weekday": 1, "startMinute": 540, "endMinute": 1020 }, ...]
  working_hours jsonb not null default
    '[{"weekday":1,"startMinute":540,"endMinute":1020},
      {"weekday":2,"startMinute":540,"endMinute":1020},
      {"weekday":3,"startMinute":540,"endMinute":1020},
      {"weekday":4,"startMinute":540,"endMinute":1020},
      {"weekday":5,"startMinute":540,"endMinute":1020}]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user planning preferences. Working hours drive the availability engine.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users delete their own profile"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Provision a profile the moment an auth user is created, so the app never has
-- to handle a signed-in user with no profile row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
