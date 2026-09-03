-- ============================================================================
-- Phase 4 confirmation transaction tests.
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(29);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'authenticated', 'authenticated', 'confirm-owner@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'authenticated', 'authenticated', 'confirm-occupied@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'authenticated', 'authenticated', 'confirm-task@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'ffffffff-ffff-ffff-ffff-ffffffffffff',
   'authenticated', 'authenticated', 'confirm-profile@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'confirm-calendar@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '88888888-8888-8888-8888-888888888888',
   'authenticated', 'authenticated', 'confirm-failure@example.com', now(), now());

insert into public.tasks (id, user_id, title, estimated_minutes, due_at, has_due_time)
values
  ('10101010-1010-1010-1010-101010101010',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Valid confirmation task', 60,
   now() + interval '7 days', true),
  ('20202020-2020-2020-2020-202020202020',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Occupied confirmation task', 60,
   now() + interval '7 days', true),
  ('30303030-3030-3030-3030-303030303030',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Changed task confirmation', 60,
   now() + interval '7 days', true),
  ('40404040-4040-4040-4040-404040404040',
   'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Changed profile confirmation', 60,
   now() + interval '7 days', true),
  ('50505050-5050-5050-5050-505050505050',
   '77777777-7777-7777-7777-777777777777', 'Changed calendar confirmation', 60,
   now() + interval '7 days', true),
  ('60606060-6060-6060-6060-606060606060',
   '88888888-8888-8888-8888-888888888888', 'Failed confirmation task', 60,
   now() + interval '7 days', true);

insert into public.ai_schedule_requests (
  id,
  user_id,
  task_id,
  status,
  constraints,
  target_calendar_id,
  task_version,
  profile_version,
  target_calendar_version,
  candidate_count
)
select fixtures.request_id,
       fixtures.user_id,
       fixtures.task_id,
       'proposed',
       '{}'::jsonb,
       c.id,
       t.updated_at,
       p.updated_at,
       c.updated_at,
       1
  from (
    values
      ('a1111111-1111-1111-1111-111111111111'::uuid,
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
       '10101010-1010-1010-1010-101010101010'::uuid),
      ('a2222222-2222-2222-2222-222222222222'::uuid,
       'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
       '20202020-2020-2020-2020-202020202020'::uuid),
      ('a3333333-3333-3333-3333-333333333333'::uuid,
       'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
       '30303030-3030-3030-3030-303030303030'::uuid),
      ('a4444444-4444-4444-4444-444444444444'::uuid,
       'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
       '40404040-4040-4040-4040-404040404040'::uuid),
      ('a5555555-5555-5555-5555-555555555555'::uuid,
       '77777777-7777-7777-7777-777777777777'::uuid,
       '50505050-5050-5050-5050-505050505050'::uuid),
      ('a6666666-6666-6666-6666-666666666666'::uuid,
       '88888888-8888-8888-8888-888888888888'::uuid,
       '60606060-6060-6060-6060-606060606060'::uuid)
  ) as fixtures(request_id, user_id, task_id)
  join public.tasks t on t.id = fixtures.task_id
  join public.profiles p on p.id = fixtures.user_id
  join public.calendars c on c.user_id = fixtures.user_id and c.is_default;

insert into public.ai_schedule_suggestions (
  id, request_id, slot_id, start_at, end_at, score, reason, rank
)
values
  ('b1111111-1111-1111-1111-111111111111',
   'a1111111-1111-1111-1111-111111111111', 'valid-slot',
   '2099-02-10T14:00:00Z', '2099-02-10T15:00:00Z', 0.95, 'Valid slot.', 1),
  ('b2222222-2222-2222-2222-222222222222',
   'a2222222-2222-2222-2222-222222222222', 'occupied-slot',
   '2099-02-11T14:00:00Z', '2099-02-11T15:00:00Z', 0.95, 'Occupied slot.', 1),
  ('b3333333-3333-3333-3333-333333333333',
   'a3333333-3333-3333-3333-333333333333', 'changed-task-slot',
   '2099-02-12T14:00:00Z', '2099-02-12T15:00:00Z', 0.95, 'Changed task slot.', 1),
  ('b4444444-4444-4444-4444-444444444444',
   'a4444444-4444-4444-4444-444444444444', 'changed-profile-slot',
   '2099-02-13T14:00:00Z', '2099-02-13T15:00:00Z', 0.95, 'Changed profile slot.', 1),
  ('b5555555-5555-5555-5555-555555555555',
   'a5555555-5555-5555-5555-555555555555', 'changed-calendar-slot',
   '2099-02-14T14:00:00Z', '2099-02-14T15:00:00Z', 0.95, 'Changed calendar slot.', 1),
  ('b6666666-6666-6666-6666-666666666666',
   'a6666666-6666-6666-6666-666666666666', 'failed-slot',
   '2099-02-15T14:00:00Z', '2099-02-15T15:00:00Z', 0.95, 'Failed slot.', 1),
  ('b1111111-1111-1111-1111-111111111112',
   'a1111111-1111-1111-1111-111111111111', 'second-slot',
   '2099-02-10T16:00:00Z', '2099-02-10T17:00:00Z', 0.8, 'Second slot.', 2);

select is(
  (select count(*)::int from public.profiles
    where id in (
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '77777777-7777-7777-7777-777777777777',
      '88888888-8888-8888-8888-888888888888'
    )),
  6,
  'confirmation fixtures have profiles'
);

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'b1111111-1111-1111-1111-111111111111')),
  'accepted',
  'a valid suggestion is accepted'
);

select is(
  (select count(*)::int from public.events
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      and title = 'Valid confirmation task'),
  1,
  'valid confirmation creates one event'
);

select is(
  (select calendar_id from public.events
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      and title = 'Valid confirmation task'),
  (select id from public.calendars
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and is_default),
  'valid confirmation targets the internal default calendar'
);

select is(
  (select status::text from public.tasks
    where id = '10101010-1010-1010-1010-101010101010'),
  'scheduled',
  'valid confirmation schedules the task'
);

select is(
  (select scheduled_event_id from public.tasks
    where id = '10101010-1010-1010-1010-101010101010'),
  (select accepted_event_id from public.ai_schedule_requests
    where id = 'a1111111-1111-1111-1111-111111111111'),
  'task link and request canonical event agree'
);

select is(
  (select accepted_at is not null from public.ai_schedule_suggestions
    where id = 'b1111111-1111-1111-1111-111111111111'),
  true,
  'the confirmed suggestion is marked accepted'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select lives_ok(
  $$insert into public.events (user_id, calendar_id, title, start_at, end_at)
    select 'cccccccc-cccc-cccc-cccc-cccccccccccc', id, 'Client event write',
           '2099-03-01T14:00:00Z', '2099-03-01T15:00:00Z'
      from public.calendars
     where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and is_default$$,
  'client-owned internal event writes remain allowed'
);

reset role;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'b1111111-1111-1111-1111-111111111111')),
  'accepted',
  'repeating confirmation is idempotent'
);

select is(
  (select event_id from public.confirm_ai_schedule_suggestion(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'b1111111-1111-1111-1111-111111111111')),
  (select accepted_event_id from public.ai_schedule_requests
    where id = 'a1111111-1111-1111-1111-111111111111'),
  'repeating confirmation returns the canonical event'
);

select is(
  (select count(*)::int from public.events
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      and title = 'Valid confirmation task'),
  1,
  'repeating confirmation creates no duplicate'
);

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'b1111111-1111-1111-1111-111111111112')),
  'stale',
  'a different suggestion from an accepted request is stale'
);

update public.ai_schedule_requests
   set constraints = jsonb_build_object('bufferMinutes', 15)
 where id = 'a2222222-2222-2222-2222-222222222222';

insert into public.events (user_id, calendar_id, title, start_at, end_at)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd', c.id, 'Newly conflicting event',
       '2099-02-11T15:05:00Z', '2099-02-11T15:05:00Z'::timestamptz + interval '1 hour'
  from public.calendars c
 where c.user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'b2222222-2222-2222-2222-222222222222')),
  'stale',
  'a newly occupied slot is rejected'
);

select is(
  (select count(*)::int from public.events
    where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      and title = 'Occupied confirmation task'),
  0,
  'an occupied proposal creates no event'
);

-- Defense-in-depth: if suggestion start time elapsed prior to RPC execution, it is stale
update public.ai_schedule_suggestions
   set start_at = now() - interval '5 minutes',
       end_at = now() + interval '25 minutes'
 where id = 'b2222222-2222-2222-2222-222222222222';

delete from public.events
 where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
   and title = 'Newly conflicting event';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'b2222222-2222-2222-2222-222222222222')),
  'stale',
  'a proposal whose start time has already passed is rejected as stale'
);

update public.tasks
   set title = 'Edited confirmation task'
 where id = '30303030-3030-3030-3030-303030303030';

update public.ai_schedule_requests
   set task_version = (
     select updated_at - interval '1 minute'
       from public.tasks
      where id = '30303030-3030-3030-3030-303030303030'
   )
 where id = 'a3333333-3333-3333-3333-333333333333';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'b3333333-3333-3333-3333-333333333333')),
  'stale',
  'an edited task proposal is stale'
);

delete from public.tasks
 where id = '30303030-3030-3030-3030-303030303030';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'b3333333-3333-3333-3333-333333333333')),
  'not_found',
  'a deleted task removes its stale suggestion'
);

update public.profiles
   set timezone = 'UTC'
 where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

update public.ai_schedule_requests
   set profile_version = (
     select updated_at - interval '1 minute'
       from public.profiles
      where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
   )
 where id = 'a4444444-4444-4444-4444-444444444444';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'b4444444-4444-4444-4444-444444444444')),
  'stale',
  'a changed profile proposal is stale'
);

update public.calendars
   set name = 'Renamed Personal'
 where user_id = '77777777-7777-7777-7777-777777777777' and is_default;

update public.ai_schedule_requests
   set target_calendar_version = (
     select updated_at - interval '1 minute'
       from public.calendars
      where user_id = '77777777-7777-7777-7777-777777777777' and is_default
   )
 where id = 'a5555555-5555-5555-5555-555555555555';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '77777777-7777-7777-7777-777777777777',
    'b5555555-5555-5555-5555-555555555555')),
  'stale',
  'a changed default calendar proposal is stale'
);

create or replace function public.test_confirmation_failure()
returns trigger
language plpgsql
as $$
begin
  raise exception 'forced confirmation failure';
end;
$$;

create trigger test_confirmation_failure
  before update on public.tasks
  for each row
  when (old.id = '60606060-6060-6060-6060-606060606060'::uuid)
  execute function public.test_confirmation_failure();

select throws_ok(
  $$select * from public.confirm_ai_schedule_suggestion(
    '88888888-8888-8888-8888-888888888888',
    'b6666666-6666-6666-6666-666666666666')$$,
  'P0001', null,
  'a write failure aborts confirmation'
);

select is(
  (select count(*)::int from public.events
    where user_id = '88888888-8888-8888-8888-888888888888'
      and title = 'Failed confirmation task'),
  0,
  'failed confirmation leaves no event'
);

select is(
  (select status::text from public.tasks
    where id = '60606060-6060-6060-6060-606060606060'),
  'open',
  'failed confirmation leaves the task open'
);

select is(
  (select scheduled_event_id from public.tasks
    where id = '60606060-6060-6060-6060-606060606060'),
  null::uuid,
  'failed confirmation leaves no task link'
);

select is(
  (select status::text from public.ai_schedule_requests
    where id = 'a6666666-6666-6666-6666-666666666666'),
  'proposed',
  'failed confirmation leaves request proposed'
);

select is(
  (select accepted_at from public.ai_schedule_suggestions
    where id = 'b6666666-6666-6666-6666-666666666666'),
  null::timestamptz,
  'failed confirmation leaves suggestion unaccepted'
);

drop trigger test_confirmation_failure on public.tasks;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'b1111111-1111-1111-1111-111111111111')),
  'not_found',
  'server scope hides another user suggestion'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select is(
  (select count(*)::int from public.ai_schedule_suggestions
    where id = 'b1111111-1111-1111-1111-111111111111'),
  0,
  'a user cannot read another users suggestions'
);

select throws_ok(
  $$select * from public.confirm_ai_schedule_suggestion(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'b1111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'the confirmation RPC is not callable by the client role'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.confirm_ai_schedule_suggestion(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'b1111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'an unauthenticated client cannot confirm'
);

reset role;

select * from finish();
rollback;
