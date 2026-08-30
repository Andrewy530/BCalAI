-- ============================================================================
-- 0006 — Sync runtime: OAuth handshake state, Vault token custody, and the
--        durable job queue that every sync path goes through.
--
-- 0004 created the *shape* of a connection (provider_accounts,
-- calendar_sync_states, sync_jobs). This migration adds the machinery that
-- makes it usable from an Edge Function without ever handing a token, a
-- cursor, or a provider payload to the client.
--
-- Everything here is service-role only. The single client-facing addition is a
-- read-only health view that deliberately reports *whether* a calendar is
-- failing, never the provider text explaining why.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- oauth_states — the few minutes between "open Google's consent screen" and
-- "Google redirects back".
--
-- PKCE requires the verifier that generated the challenge to be presented at
-- token exchange. It cannot live in the app (a public client cannot keep a
-- secret across an external browser round trip) and it cannot live in memory
-- (Edge Functions are stateless), so it lives here and is deleted on use.
-- ---------------------------------------------------------------------------
create table public.oauth_states (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.provider_kind not null,
  -- Opaque value echoed by the provider; the CSRF defence for the callback.
  state text not null unique,
  code_verifier text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  -- Short by design. A consent screen that takes longer than this has been
  -- abandoned, and a stale verifier is a liability rather than a convenience.
  expires_at timestamptz not null default now() + interval '15 minutes'
);

create index oauth_states_expiry_idx on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;
-- Intentionally no policies: service-role access only.

comment on table public.oauth_states is
  'Short-lived PKCE verifiers for in-flight provider connections. Server-only.';

-- ---------------------------------------------------------------------------
-- Webhook bookkeeping that 0004 could not anticipate in detail.
-- ---------------------------------------------------------------------------

-- Google sends the channel id in `X-Goog-Channel-ID`; routing a delivery to a
-- calendar is a lookup on that value, so it needs an index of its own.
create index calendar_sync_states_channel_idx
  on public.calendar_sync_states (webhook_channel_id)
  where webhook_channel_id is not null;

-- Google echoes `X-Goog-Channel-Token` verbatim on every delivery. Comparing
-- it is what stops an attacker who guesses a channel id from forcing syncs.
alter table public.calendar_sync_states
  add column webhook_token text;

-- Set when a cursor is rejected (Google 410) so the next run knows to do a
-- full resync rather than retrying an invalid token forever.
alter table public.calendar_sync_states
  add column needs_full_resync boolean not null default false;

comment on column public.calendar_sync_states.webhook_token is
  'Shared secret echoed by the provider on each delivery. Verified before work is enqueued.';

-- ---------------------------------------------------------------------------
-- Vault custody for provider refresh tokens.
--
-- PostgREST only exposes `public`, so an Edge Function cannot call
-- vault.create_secret directly. These three wrappers are the entire surface,
-- they are SECURITY DEFINER, and EXECUTE is revoked from every client role —
-- so possession of the anon key grants no path to a token.
-- ---------------------------------------------------------------------------
create extension if not exists supabase_vault with schema vault;

create or replace function public.store_provider_secret(
  p_account_id uuid,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_secret_id uuid;
begin
  select secret_reference_id into v_existing
  from public.provider_accounts
  where id = p_account_id;

  -- Re-connecting an account replaces the token in place; a new secret row per
  -- reconnect would leak old grants into the Vault indefinitely.
  if v_existing is not null then
    perform vault.update_secret(v_existing, p_secret);
    return v_existing;
  end if;

  v_secret_id := vault.create_secret(
    p_secret,
    'provider_account_' || p_account_id::text,
    'OAuth refresh token'
  );

  update public.provider_accounts
  set secret_reference_id = v_secret_id
  where id = p_account_id;

  return v_secret_id;
end;
$$;

create or replace function public.read_provider_secret(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select ds.decrypted_secret into v_secret
  from public.provider_accounts pa
  join vault.decrypted_secrets ds on ds.id = pa.secret_reference_id
  where pa.id = p_account_id;

  return v_secret;
end;
$$;

create or replace function public.delete_provider_secret(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select secret_reference_id into v_secret_id
  from public.provider_accounts
  where id = p_account_id;

  if v_secret_id is null then
    return;
  end if;

  delete from vault.secrets where id = v_secret_id;

  update public.provider_accounts
  set secret_reference_id = null
  where id = p_account_id;
end;
$$;

revoke all on function public.store_provider_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.read_provider_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_provider_secret(uuid) from public, anon, authenticated;

comment on function public.read_provider_secret is
  'Service-role only. Returns the decrypted refresh token for a connected account.';

-- ---------------------------------------------------------------------------
-- The job queue.
--
-- Webhooks, cron, and the connect flow all enqueue; one worker drains. That
-- indirection is what makes a replayed delivery harmless and a failure
-- visible instead of lost in a request that already returned 200.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_sync_job(
  p_user_id uuid,
  p_provider_account_id uuid,
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_run_after timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  insert into public.sync_jobs (user_id, provider_account_id, kind, payload, idempotency_key, run_after)
  values (p_user_id, p_provider_account_id, p_kind, p_payload, p_idempotency_key, p_run_after)
  on conflict (idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_job_id;

  -- A duplicate delivery is a no-op, not an error: the original job is either
  -- still queued or has already done the work.
  return v_job_id;
end;
$$;

/**
 * Atomically hand a batch of due jobs to one worker.
 *
 * SKIP LOCKED is what allows two concurrent invocations — a webhook-triggered
 * run and a cron-triggered run arriving together — to drain the same queue
 * without either blocking or double-processing a row.
 */
create or replace function public.claim_sync_jobs(p_limit integer default 10)
returns setof public.sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select id
    from public.sync_jobs
    where status in ('queued', 'failed')
      and run_after <= now()
    order by run_after
    limit p_limit
    for update skip locked
  )
  update public.sync_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      updated_at = now()
  from claimed
  where j.id = claimed.id
  returning j.*;
end;
$$;

/**
 * Close out a claimed job.
 *
 * Failure is retried with exponential backoff until `p_max_attempts`, then the
 * job becomes `dead` — a terminal state that stays in the table on purpose, so
 * an exhausted sync is something the owner can see rather than something that
 * quietly stopped happening.
 */
create or replace function public.complete_sync_job(
  p_job_id uuid,
  p_succeeded boolean,
  p_error text default null,
  p_max_attempts integer default 5
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_succeeded then
    update public.sync_jobs
    set status = 'succeeded', last_error = null, updated_at = now()
    where id = p_job_id;
    return;
  end if;

  select attempts into v_attempts from public.sync_jobs where id = p_job_id;

  update public.sync_jobs
  set status = case when v_attempts >= p_max_attempts then 'dead' else 'failed' end,
      last_error = left(coalesce(p_error, 'unknown'), 500),
      -- 1m, 2m, 4m, 8m, 16m — long enough to outlast a provider blip, short
      -- enough that a recovered account catches up within an hour.
      run_after = now() + (power(2, least(v_attempts, 6)) * interval '30 seconds'),
      updated_at = now()
  where id = p_job_id;
end;
$$;

/** Housekeeping: successful jobs and dead handshakes are not worth keeping. */
create or replace function public.prune_sync_history(p_older_than interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.oauth_states where expires_at < now();

  delete from public.sync_jobs
  where status = 'succeeded' and updated_at < now() - p_older_than;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.enqueue_sync_job(uuid, uuid, text, jsonb, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_sync_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_sync_job(uuid, boolean, text, integer)
  from public, anon, authenticated;
revoke all on function public.prune_sync_history(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client-facing sync health.
--
-- calendar_sync_states has RLS on and no policies, which is correct — it holds
-- cursors and webhook identifiers. But a user still needs to know that their
-- calendar has stopped syncing. This view is the narrow answer: booleans and
-- timestamps, never `last_error` itself, which contains provider text.
--
-- security_invoker is intentionally false. The view runs as its owner so it
-- can read the underlying table, and the WHERE clause below is what restricts
-- rows to the caller — so it must stay.
-- ---------------------------------------------------------------------------
create view public.calendar_sync_health
with (security_invoker = false) as
  select
    css.calendar_id,
    pa.id                                    as provider_account_id,
    pa.user_id,
    pa.provider,
    pa.status                                as account_status,
    css.last_full_sync_at,
    css.last_incremental_sync_at,
    css.webhook_expires_at,
    css.needs_full_resync,
    css.last_error is not null               as has_error,
    css.retry_count
  from public.calendar_sync_states css
  join public.provider_accounts pa on pa.id = css.provider_account_id
  where pa.user_id = (select auth.uid());

comment on view public.calendar_sync_health is
  'Per-calendar sync health for the owner. Reports that an error exists, never its provider text.';

grant select on public.calendar_sync_health to authenticated;
