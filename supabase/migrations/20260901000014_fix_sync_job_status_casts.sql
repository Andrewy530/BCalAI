-- ============================================================================
-- 0014 — Cast sync job status CASE expressions to the status enum.
--
-- PostgreSQL does not infer the target enum type for a CASE expression in an
-- UPDATE assignment. The claim-fencing migration therefore created functions
-- whose stale-lease and retry paths failed when first executed.
-- ============================================================================

create or replace function public.complete_sync_job(
  p_job_id uuid,
  p_succeeded boolean,
  p_claim_token uuid,
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
  -- A missing or old token is never allowed to release an account's job.
  if p_claim_token is null then
    return;
  end if;

  if p_succeeded then
    update public.sync_jobs
    set status = 'succeeded', last_error = null, claim_token = null, updated_at = now()
    where id = p_job_id
      and status = 'running'
      and claim_token = p_claim_token;
    return;
  end if;

  select attempts into v_attempts
  from public.sync_jobs
  where id = p_job_id
    and status = 'running'
    and claim_token = p_claim_token;

  if v_attempts is null then
    return;
  end if;

  update public.sync_jobs
  set status = case
        when v_attempts >= p_max_attempts then 'dead'::public.sync_job_status
        else 'failed'::public.sync_job_status
      end,
      last_error = left(coalesce(p_error, 'unknown'), 500),
      claim_token = null,
      run_after = now() + (power(2, least(v_attempts, 6)) * interval '30 seconds'),
      updated_at = now()
  where id = p_job_id
    and status = 'running'
    and claim_token = p_claim_token;
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
  -- Clearing the old token makes the lease transition explicit; a later claim
  -- receives a new token and the old worker is fenced from completion.
  update public.sync_jobs
  set status = case
        when attempts >= 5 then 'dead'::public.sync_job_status
        else 'failed'::public.sync_job_status
      end,
      claim_token = null,
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
      claim_token = extensions.gen_random_uuid(),
      attempts = j.attempts + 1,
      updated_at = now()
  from selected
  where j.id = selected.id
  returning j.*;
end;
$$;
