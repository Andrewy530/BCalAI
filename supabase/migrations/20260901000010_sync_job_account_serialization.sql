-- ============================================================================
-- 0010 — Serialize provider work per connected account.
--
-- A provider account can own several imported calendars, but provider APIs and
-- mailbox watches are account-scoped in important cases (notably Microsoft
-- Graph). A worker must therefore never claim two due jobs for one account at
-- the same time, even when several queue drainers run concurrently.
--
-- The provider_accounts row is the serialization point. claim_sync_jobs locks
-- a candidate account while it chooses one job, then marks that job running.
-- The running status remains the durable lock while the worker is talking to
-- the provider; another claim cannot select that account until complete_sync_job
-- closes the running job. Jobs without an account are legacy queue entries and
-- retain the old row-level SKIP LOCKED behaviour.
-- ============================================================================

create index sync_jobs_running_account_idx
  on public.sync_jobs (provider_account_id)
  where status = 'running' and provider_account_id is not null;

create index sync_jobs_running_lease_idx
  on public.sync_jobs (updated_at)
  where status = 'running';

-- A worker invocation is bounded well below this lease. If a process dies
-- after claiming, its account must become claimable rather than remaining
-- blocked forever. A live invocation that exceeds the lease is treated as
-- abandoned; the lease is intentionally conservative for a provider call.
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
  do update
  set status = 'queued',
      run_after = excluded.run_after,
      last_error = null,
      updated_at = now()
  where public.sync_jobs.status = 'dead'
  returning id into v_job_id;

  -- A duplicate key for queued, running, failed, or succeeded work is a
  -- success. Dead work is the exception: enqueueing the same durable import
  -- key revives that one row without creating a duplicate.
  return v_job_id;
end;
$$;

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
  -- A late completion from a worker that no longer owns a job must not close
  -- a queued/dead row and release an account accidentally. The row is only
  -- completable while it is in the claimed state.
  if p_succeeded then
    update public.sync_jobs
    set status = 'succeeded', last_error = null, updated_at = now()
    where id = p_job_id and status = 'running';
    return;
  end if;

  select attempts into v_attempts
  from public.sync_jobs
  where id = p_job_id and status = 'running';

  if v_attempts is null then
    return;
  end if;

  update public.sync_jobs
  set status = case when v_attempts >= p_max_attempts then 'dead' else 'failed' end,
      last_error = left(coalesce(p_error, 'unknown'), 500),
      -- 1m, 2m, 4m, 8m, 16m — long enough to outlast a provider blip, short
      -- enough that a recovered account catches up within an hour.
      run_after = now() + (power(2, least(v_attempts, 6)) * interval '30 seconds'),
      updated_at = now()
  where id = p_job_id and status = 'running';
end;
$$;

create or replace function public.claim_sync_jobs(p_limit integer default 10)
returns setof public.sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 10), 0);
begin
  -- Requeue work whose worker died after the claim transaction committed.
  -- UPDATE's row locks make recovery idempotent when two claimers arrive at
  -- the same time; only one can transition a stale running row.
  update public.sync_jobs
  set status = case when attempts >= 5 then 'dead' else 'failed' end,
      last_error = 'WORKER_LEASE_EXPIRED',
      run_after = case
        when attempts >= 5 then run_after
        else now() + (power(2, least(attempts, 6)) * interval '30 seconds')
      end,
      updated_at = now()
  where status = 'running'
    and updated_at < now() - interval '15 minutes';

  return query
  with account_candidates as materialized (
    -- Locking the account row closes the race between two claimers that both
    -- observe an account with no running job. SKIP LOCKED lets the other worker
    -- continue with different accounts instead of waiting on this one.
    select pa.id
    from public.provider_accounts pa
    where not exists (
      select 1
      from public.sync_jobs running
      where running.provider_account_id = pa.id
        and running.status = 'running'
    )
      and exists (
        select 1
        from public.sync_jobs due
        where due.provider_account_id = pa.id
          and due.status in ('queued', 'failed')
          and due.run_after <= now()
      )
    order by (
      select min(due.run_after)
      from public.sync_jobs due
      where due.provider_account_id = pa.id
        and due.status in ('queued', 'failed')
        and due.run_after <= now()
    ), pa.id
    limit v_limit
    for update skip locked
  ),
  account_jobs as materialized (
    -- One due job per locked account. The account lock, rather than a job lock,
    -- is what prevents a second worker from selecting another job for it.
    select distinct on (j.provider_account_id)
      j.id,
      j.run_after,
      j.created_at
    from public.sync_jobs j
    join account_candidates candidate on candidate.id = j.provider_account_id
    where j.status in ('queued', 'failed')
      and j.run_after <= now()
    order by j.provider_account_id, j.run_after, j.created_at, j.id
  ),
  legacy_jobs as materialized (
    -- Keep pre-account jobs claimable. They have no provider operation to
    -- serialize, so their row lock remains sufficient.
    select j.id, j.run_after, j.created_at
    from public.sync_jobs j
    where j.provider_account_id is null
      and j.status in ('queued', 'failed')
      and j.run_after <= now()
    order by j.run_after, j.created_at, j.id
    limit v_limit
    for update skip locked
  ),
  selected as materialized (
    select id, run_after, created_at
    from account_jobs
    union all
    select id, run_after, created_at
    from legacy_jobs
    order by run_after, created_at, id
    limit v_limit
  )
  update public.sync_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      updated_at = now()
  from selected
  where j.id = selected.id
  returning j.*;
end;
$$;
