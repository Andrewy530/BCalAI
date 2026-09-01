-- ============================================================================
-- Durable queue invariants. Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'authenticated', 'authenticated', 'queue@example.com', now(), now());

insert into public.provider_accounts (id, user_id, provider, provider_user_id)
values
  ('11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'google', 'queue-google'),
  ('22222222-2222-2222-2222-222222222222',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'microsoft', 'queue-microsoft'),
  ('33333333-3333-3333-3333-333333333333',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'google', 'queue-google-2');

-- Two jobs for account A, one for account B, and one legacy job with no
-- provider account. A claim may take only one job for each connected account.
insert into public.sync_jobs (
  user_id, provider_account_id, kind, payload, run_after, idempotency_key
)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '11111111-1111-1111-1111-111111111111', 'calendar.sync', '{"calendarId":"a1"}',
   now() - interval '4 minutes', 'queue-a-1'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '11111111-1111-1111-1111-111111111111', 'calendar.sync', '{"calendarId":"a2"}',
   now() - interval '3 minutes', 'queue-a-2'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222', 'calendar.sync', '{"calendarId":"b1"}',
   now() - interval '2 minutes', 'queue-b-1'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   null, 'legacy.job', '{}', now() - interval '1 minute', 'queue-legacy');

insert into public.sync_jobs (
  user_id, provider_account_id, kind, payload, status, attempts, updated_at,
  run_after, idempotency_key
)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '33333333-3333-3333-3333-333333333333', 'calendar.sync', '{"calendarId":"c1"}',
  'running', 1, now() - interval '16 minutes', now() - interval '16 minutes', 'queue-c-stale'
);

select is(
  (select count(*)::int from public.claim_sync_jobs(10)),
  3,
  'a claim returns one job per provider account plus legacy work'
);

select is(
  (select count(*)::int
   from public.sync_jobs
   where status = 'running'
     and provider_account_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'the first account has at most one running job'
);

select is(
  (select count(*)::int
   from public.sync_jobs
   where status = 'running'
     and provider_account_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'the second account can be claimed independently'
);

select is(
  (select count(*)::int
   from public.sync_jobs
   where status = 'running'
     and provider_account_id is null),
  1,
  'legacy jobs without an account remain claimable'
);

select is(
  (select attempts from public.sync_jobs where idempotency_key = 'queue-a-1'),
  1,
  'claim increments attempts'
);

select is(
  (select count(*)::int
   from public.sync_jobs
   where idempotency_key = 'queue-a-2' and status = 'queued'),
  1,
  'the second job for a running account stays queued'
);

select is(
  (select status::text from public.sync_jobs where idempotency_key = 'queue-c-stale'),
  'failed',
  'an abandoned running job is recovered with retryable status'
);

select is(
  (select last_error from public.sync_jobs where idempotency_key = 'queue-c-stale'),
  'WORKER_LEASE_EXPIRED',
  'stale recovery records a stable internal error code'
);

-- Once the first job completes, the next job for that same account becomes
-- eligible. This is the hand-off drainQueue relies on.
select public.complete_sync_job(
  (select id from public.sync_jobs where idempotency_key = 'queue-a-1'),
  true
);

select is(
  (select count(*)::int
   from public.claim_sync_jobs(10) j
   where j.provider_account_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'a second account job is claimable after the first completes'
);

select is(
  (select attempts from public.sync_jobs where idempotency_key = 'queue-a-2'),
  1,
  'the second account job is claimed exactly once'
);

-- The recovered job has the normal retry backoff. Make it due to verify that
-- the account is eventually unblocked without bypassing the one-job rule.
update public.sync_jobs
set run_after = now()
where idempotency_key = 'queue-c-stale';

select is(
  (select count(*)::int
   from public.claim_sync_jobs(10) j
   where j.provider_account_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'recovered work can be claimed after its retry delay'
);

select is(
  public.enqueue_sync_job(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '11111111-1111-1111-1111-111111111111',
    'calendar.initial_sync',
    '{"calendarId":"a3"}',
    'calendar-initial-sync:calendar-a3',
    now()
  ),
  (select id from public.sync_jobs where idempotency_key = 'calendar-initial-sync:calendar-a3'),
  'the first enqueue returns the durable job id'
);

select is(
  public.enqueue_sync_job(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '11111111-1111-1111-1111-111111111111',
    'calendar.initial_sync',
    '{"calendarId":"a3"}',
    'calendar-initial-sync:calendar-a3',
    now()
  ),
  null::uuid,
  'a duplicate idempotency key does not create another initial job'
);

update public.sync_jobs
set status = 'dead'
where idempotency_key = 'calendar-initial-sync:calendar-a3';

select is(
  public.enqueue_sync_job(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '11111111-1111-1111-1111-111111111111',
    'calendar.initial_sync',
    '{"calendarId":"a3"}',
    'calendar-initial-sync:calendar-a3',
    now()
  ),
  (select id from public.sync_jobs where idempotency_key = 'calendar-initial-sync:calendar-a3'),
  'a dead durable initial job is revived by the same idempotency key'
);

select is(
  (select status::text
   from public.sync_jobs
   where idempotency_key = 'calendar-initial-sync:calendar-a3'),
  'queued',
  'reviving a dead initial job preserves one queue row'
);

select is(
  (select count(*)::int
   from public.sync_jobs
   where idempotency_key = 'calendar-initial-sync:calendar-a3'),
  1,
  'the duplicate initial import leaves one durable job'
);

select is(
  (select count(*)::int from public.sync_jobs where idempotency_key = 'queue-a-1'),
  1,
  'claimed jobs remain in history for completion and retry tracking'
);

-- Back to the owning role so finish() is unaffected by RLS.
reset role;

select * from finish();
rollback;
