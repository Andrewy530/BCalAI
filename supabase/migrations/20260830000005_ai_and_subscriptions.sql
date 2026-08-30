-- ============================================================================
-- 0005 — AI scheduling requests and subscription entitlements.
-- ============================================================================

create type public.ai_request_status as enum
  ('pending', 'proposed', 'accepted', 'rejected', 'failed');

create table public.ai_schedule_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  status public.ai_request_status not null default 'pending',
  -- The normalised constraints handed to the deterministic engine.
  constraints jsonb not null default '{}'::jsonb,
  -- Stable code (AI_NO_VALID_SLOT, AI_RATE_LIMITED, ...) when status = 'failed'.
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_schedule_requests_user_idx
  on public.ai_schedule_requests (user_id, created_at desc);
-- Supports the per-user rate limit checked server-side before each call.
create index ai_schedule_requests_rate_idx
  on public.ai_schedule_requests (user_id, created_at);

alter table public.ai_schedule_requests enable row level security;

create policy "Users read their own AI requests"
  on public.ai_schedule_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users update their own AI requests"
  on public.ai_schedule_requests for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- INSERT is server-only: the Edge Function checks entitlement and rate limits
-- before a request may exist.

create table public.ai_schedule_suggestions (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null references public.ai_schedule_requests (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  score numeric(4, 3) not null check (score between 0 and 1),
  reason text not null check (char_length(reason) <= 280),
  rank smallint not null check (rank between 1 and 5),
  accepted_at timestamptz,

  constraint ai_suggestion_end_after_start check (end_at > start_at),
  unique (request_id, rank)
);

create index ai_schedule_suggestions_request_idx
  on public.ai_schedule_suggestions (request_id, rank);

alter table public.ai_schedule_suggestions enable row level security;

create policy "Users read suggestions for their own requests"
  on public.ai_schedule_suggestions for select to authenticated
  using (exists (
    select 1 from public.ai_schedule_requests r
    where r.id = ai_schedule_suggestions.request_id and r.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- subscriptions — mirror of RevenueCat entitlements, written by its webhook.
-- Entitlement is always verified server-side; the client copy is for UI only.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'revenuecat',
  entitlement text not null,
  status text not null,
  expires_at timestamptz,
  raw_customer_id text,
  updated_at timestamptz not null default now(),

  unique (user_id, entitlement)
);

create index subscriptions_active_idx on public.subscriptions (user_id, status, expires_at);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Users read their own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
-- Writes are service-role only, from the RevenueCat webhook.

-- ---------------------------------------------------------------------------
-- The single server-side entitlement check. Edge Functions call this rather
-- than trusting anything the client sends.
-- ---------------------------------------------------------------------------
create or replace function public.has_active_entitlement(
  p_user_id uuid,
  p_entitlement text default 'pro'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.entitlement = p_entitlement
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > now())
  );
$$;

comment on function public.has_active_entitlement is
  'Authoritative Pro check. Never gate a paid feature on a client-supplied flag.';
