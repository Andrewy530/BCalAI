-- ============================================================================
-- RLS regression tests. Run with: supabase test db
--
-- These exist because an RLS mistake is silent: the app keeps working, it just
-- starts showing one user another user's calendar. CI runs them on every PR.
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(14);

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

-- Server-only tables must be invisible even to a signed-in user.
select is(
  (select count(*)::int from public.calendar_sync_states), 0,
  'sync state is invisible to the client role'
);

-- Writing on someone else's behalf must fail the WITH CHECK clause.
select throws_ok(
  $$insert into public.tasks (user_id, title)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Forged task')$$,
  '42501',
  null,
  'a user cannot insert a task owned by someone else'
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
