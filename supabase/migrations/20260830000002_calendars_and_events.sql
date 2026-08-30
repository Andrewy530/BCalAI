-- ============================================================================
-- 0002 — Calendars and events.
--
-- Source-of-truth rule (docs/architecture.md § Decision A):
--   source_type = 'internal'  → this database is authoritative.
--   otherwise                 → the provider is authoritative and this row is a
--                               normalised synchronised copy.
-- ============================================================================

create type public.calendar_source as enum ('internal', 'google', 'microsoft', 'device');
create type public.event_status as enum ('confirmed', 'tentative', 'cancelled');
create type public.sync_status as enum ('synced', 'pending', 'failed', 'conflict');

-- ---------------------------------------------------------------------------
-- calendars
-- ---------------------------------------------------------------------------
create table public.calendars (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  color text not null default '#6E8BFF' check (color ~ '^#[0-9a-fA-F]{6}$'),
  source_type public.calendar_source not null default 'internal',
  provider_account_id uuid,          -- FK added in 0004, once the table exists
  provider_calendar_id text,
  is_visible boolean not null default true,
  is_default boolean not null default false,
  is_read_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An internal calendar has no provider identity; a synced one must have both.
  constraint calendars_provider_identity_coherent check (
    (source_type = 'internal' and provider_account_id is null and provider_calendar_id is null)
    or (source_type <> 'internal' and provider_calendar_id is not null)
  )
);

create index calendars_user_id_idx on public.calendars (user_id);

-- One default calendar per user. A partial unique index expresses this without
-- needing a trigger to demote the previous default.
create unique index calendars_one_default_per_user_idx
  on public.calendars (user_id)
  where is_default;

-- The same provider calendar must never be imported twice.
create unique index calendars_provider_identity_idx
  on public.calendars (provider_account_id, provider_calendar_id)
  where provider_account_id is not null;

create trigger calendars_set_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();

alter table public.calendars enable row level security;

create policy "Users read their own calendars"
  on public.calendars for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own calendars"
  on public.calendars for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own calendars"
  on public.calendars for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own calendars"
  on public.calendars for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 10000),
  location text check (char_length(location) <= 500),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'UTC',
  status public.event_status not null default 'confirmed',
  -- RFC 5545 RRULE string. NULL for a one-off event.
  recurrence_rule text,
  -- Minutes before start_at at which to alert. Empty array = no alert.
  alerts integer[] not null default '{}',
  source_type public.calendar_source not null default 'internal',
  provider_account_id uuid,
  provider_event_id text,
  provider_etag text,
  provider_updated_at timestamptz,
  sync_status public.sync_status not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_end_after_start check (end_at >= start_at)
);

-- The workhorse index: "everything in this window, for this user".
create index events_user_window_idx on public.events (user_id, start_at, end_at);
create index events_calendar_idx on public.events (calendar_id, start_at);
create index events_needs_push_idx on public.events (sync_status)
  where sync_status in ('pending', 'failed', 'conflict');

-- Idempotency key for provider sync: an upsert on this pair can safely replay.
create unique index events_provider_identity_idx
  on public.events (provider_account_id, provider_event_id)
  where provider_account_id is not null and provider_event_id is not null;

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

create policy "Users read their own events"
  on public.events for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own events"
  on public.events for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own events"
  on public.events for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own events"
  on public.events for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Give every new user a default calendar alongside their profile.
-- ---------------------------------------------------------------------------
create or replace function public.create_default_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.calendars (user_id, name, color, is_default)
  values (new.id, 'Personal', '#6E8BFF', true)
  on conflict do nothing;

  return new;
end;
$$;

create trigger profiles_create_default_calendar
  after insert on public.profiles
  for each row execute function public.create_default_calendar();
