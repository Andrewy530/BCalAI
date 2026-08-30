-- ============================================================================
-- 0004 — Connected provider accounts and sync state.
--
-- Security rule: a connected calendar account is NOT the same thing as the
-- app login. Refresh tokens live in Vault; this table stores only a reference
-- to the secret, and RLS deliberately grants the client no access at all to
-- the token columns — Edge Functions read them with the service role.
-- ============================================================================

create type public.provider_kind as enum ('google', 'microsoft');
create type public.provider_status as enum ('active', 'expired', 'revoked', 'error');

create table public.provider_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.provider_kind not null,
  provider_user_id text not null,
  email text,
  status public.provider_status not null default 'active',
  scopes text[] not null default '{}',
  -- Vault secret id. Never a token value.
  secret_reference_id uuid,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, provider, provider_user_id)
);

create index provider_accounts_user_idx on public.provider_accounts (user_id);

create trigger provider_accounts_set_updated_at
  before update on public.provider_accounts
  for each row execute function public.set_updated_at();

alter table public.provider_accounts enable row level security;

-- The client may see *that* an account is connected and disconnect it. It may
-- never insert or update one: connections are established by an Edge Function
-- that holds the OAuth secrets.
create policy "Users see their own connections"
  on public.provider_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users disconnect their own connections"
  on public.provider_accounts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Column-level defence in depth: even if a SELECT policy is ever widened by
-- mistake, the secret reference stays unreadable by client roles.
--
-- Note the shape: a column-level REVOKE cannot subtract from a table-level
-- grant, so the table-level SELECT is revoked first and only the safe columns
-- are granted back.
revoke select on public.provider_accounts from authenticated, anon;

grant select (
  id, user_id, provider, provider_user_id, email, status, scopes,
  connected_at, last_sync_at, last_error, created_at, updated_at
) on public.provider_accounts to authenticated;

-- A client-safe projection for the integrations screen.
create view public.provider_accounts_public
with (security_invoker = true) as
  select id, user_id, provider, email, status, scopes, connected_at, last_sync_at
  from public.provider_accounts;

comment on view public.provider_accounts_public is
  'Connection status for the integrations screen. Excludes token references.';

-- Now that provider_accounts exists, close the FKs left open in 0002.
alter table public.calendars
  add constraint calendars_provider_account_fkey
  foreign key (provider_account_id) references public.provider_accounts (id) on delete cascade;

alter table public.events
  add constraint events_provider_account_fkey
  foreign key (provider_account_id) references public.provider_accounts (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- calendar_sync_states — one row per synced calendar.
--
-- Holds Google `syncToken` / Microsoft delta state plus webhook bookkeeping.
-- Written only by Edge Functions; the client has no policies here at all, so
-- with RLS on and no policy the table is invisible to `authenticated`.
-- ---------------------------------------------------------------------------
create table public.calendar_sync_states (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_account_id uuid not null references public.provider_accounts (id) on delete cascade,
  calendar_id uuid references public.calendars (id) on delete cascade,
  provider_calendar_id text not null,
  sync_cursor text,
  webhook_channel_id text,
  webhook_resource_id text,
  webhook_subscription_id text,
  webhook_expires_at timestamptz,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_error text,
  retry_count integer not null default 0,
  updated_at timestamptz not null default now(),

  unique (provider_account_id, provider_calendar_id)
);

-- Cron uses this to renew webhooks before they lapse.
create index calendar_sync_states_expiry_idx on public.calendar_sync_states (webhook_expires_at)
  where webhook_expires_at is not null;
-- ...and this to find syncs that need retrying.
create index calendar_sync_states_retry_idx on public.calendar_sync_states (retry_count)
  where retry_count > 0;

create trigger calendar_sync_states_set_updated_at
  before update on public.calendar_sync_states
  for each row execute function public.set_updated_at();

alter table public.calendar_sync_states enable row level security;
-- Intentionally no policies: service-role access only.

-- ---------------------------------------------------------------------------
-- sync_jobs — durable queue so a webhook can acknowledge fast and do the work
-- afterwards, and so a failed sync is visible rather than silently lost.
-- ---------------------------------------------------------------------------
create type public.sync_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

create table public.sync_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_account_id uuid references public.provider_accounts (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.sync_job_status not null default 'queued',
  attempts integer not null default 0,
  -- Deduplicates replayed webhook deliveries.
  idempotency_key text,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sync_jobs_idempotency_idx on public.sync_jobs (idempotency_key)
  where idempotency_key is not null;
create index sync_jobs_queue_idx on public.sync_jobs (status, run_after)
  where status in ('queued', 'failed');

create trigger sync_jobs_set_updated_at
  before update on public.sync_jobs
  for each row execute function public.set_updated_at();

alter table public.sync_jobs enable row level security;

-- Users may watch the health of their own syncs; only the server writes them.
create policy "Users read their own sync jobs"
  on public.sync_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
