-- ============================================================================
-- RLS regression tests. Run with: supabase test db
--
-- These exist because an RLS mistake is silent: the app keeps working, it just
-- starts showing one user another user's calendar. CI runs them on every PR.
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(24);

-- --- fixtures --------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'alice@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'bob@example.com', now(), now());

-- The signup triggers should have provisioned both users already.
select is(
  (select count(*)::int from public.profiles
   where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  2, 'every new auth user gets a profile'
);

select is(
  (select count(*)::int from public.calendars
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and is_default),
  1, 'every new user gets exactly one default calendar'
);

insert into public.tasks (user_id, title)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice task'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob task');

insert into public.ai_schedule_requests (
  id, user_id, task_id, status, target_calendar_id, task_version, candidate_count
)
select
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  t.id,
  'proposed',
  c.id,
  now(),
  1
from public.tasks t
join public.calendars c on c.user_id = t.user_id and c.is_default
where t.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.ai_schedule_suggestions (
  id, request_id, slot_id, start_at, end_at, score, reason, rank
)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'candidate_rls_a1',
  now() + interval '1 hour',
  now() + interval '2 hours',
  0.9,
  'A valid proposed slot.',
  1
);

-- --- RLS is switched on at all -------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'RLS is enabled on tasks'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'RLS is enabled on events'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.provider_accounts'::regclass),
  'RLS is enabled on provider_accounts'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.calendar_sync_states'::regclass),
  'RLS is enabled on calendar_sync_states'
);

-- --- act as Alice ---------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select count(*)::int from public.tasks), 1, 'Alice sees only her own task');
select is((select title from public.tasks), 'Alice task', 'and it is hers');
select is((select count(*)::int from public.profiles), 1, 'Alice sees only her own profile');
select is((select count(*)::int from public.calendars), 1, 'Alice sees only her own calendar');

select is(
  (select count(*)::int from public.ai_schedule_requests), 1,
  'Alice sees her own AI request'
);

select is(
  (select count(*)::int from public.ai_schedule_suggestions), 1,
  'Alice sees suggestions only for her proposed request'
);

-- Server-only tables must be invisible even to a signed-in user.
select is(
  (select count(*)::int from public.calendar_sync_states), 0,
  'sync state is invisible to the client role'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.provider_accounts', 'webhook_channel_id', 'SELECT'
  )
  and not has_column_privilege(
    'authenticated', 'public.provider_accounts', 'webhook_resource_id', 'SELECT'
  )
  and not has_column_privilege(
    'authenticated', 'public.provider_accounts', 'webhook_subscription_id', 'SELECT'
  )
  and not has_column_privilege(
    'authenticated', 'public.provider_accounts', 'webhook_token', 'SELECT'
  )
  and not has_column_privilege(
    'authenticated', 'public.provider_accounts', 'webhook_expires_at', 'SELECT'
  ),
  'account watch columns are unreadable by the client role'
);

select ok(
  not has_table_privilege('authenticated', 'public.provider_accounts', 'DELETE'),
  'provider accounts cannot be deleted directly by the client role'
);

select ok(
  not has_column_privilege('authenticated', 'public.sync_jobs', 'claim_token', 'SELECT'),
  'sync-job claim tokens are unreadable by the client role'
);

select is(
  (select count(*)::int
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'provider_accounts_public'
     and column_name like 'webhook_%'),
  0,
  'account watch columns are absent from the public account view'
);

-- Writing on someone else's behalf must fail the WITH CHECK clause.
select throws_ok(
  $$insert into public.tasks (user_id, title)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Forged task')$$,
  '42501',
  null,
  'a user cannot insert a task owned by someone else'
);

select throws_ok(
  $$insert into public.ai_schedule_requests (user_id, task_id)
    select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id
    from public.tasks where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501', null,
  'AI requests cannot be inserted by the client role'
);

select lives_ok(
  $$update public.ai_schedule_requests
    set status = 'rejected'
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'client update of AI requests is filtered by RLS'
);

select is(
  (select status::text from public.ai_schedule_requests
   where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'proposed',
  'AI request status remains server-managed'
);

select throws_ok(
  $$select public.claim_ai_schedule_request(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    (select id from public.tasks where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  )$$,
  '42501', null,
  'the rate-limit claim is server-only'
);

select is(
  (select count(*)::int from public.tasks
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0, 'and cannot even see whether the other user has tasks'
);

-- --- act as Bob -----------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select title from public.tasks), 'Bob task', 'Bob sees only his own task');

-- Back to the owning role so finish() is unaffected by RLS.
reset role;

select * from finish();
rollback;
