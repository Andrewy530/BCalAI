-- ============================================================================
-- Phase 4 recurrence-aware confirmation tests.
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(23);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999999',
  'authenticated', 'authenticated', 'confirm-recurrence@example.com', now(), now()
);

insert into public.tasks (id, user_id, title, estimated_minutes, due_at, has_due_time)
values
  ('70707070-7070-7070-7070-707070707070', '99999999-9999-9999-9999-999999999999',
   'Existing recurring master task', 60, now() + interval '90 days', true),
  ('80808080-8080-8080-8080-808080808080', '99999999-9999-9999-9999-999999999999',
   'Created recurring master task', 60, now() + interval '90 days', true),
  ('90909090-9090-9090-9090-909090909090', '99999999-9999-9999-9999-999999999999',
   'Changed recurring master task', 60, now() + interval '90 days', true),
  ('abababab-abab-abab-abab-abababababab', '99999999-9999-9999-9999-999999999999',
   'Moved recurrence exception task', 60, now() + interval '90 days', true),
  ('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', '99999999-9999-9999-9999-999999999999',
   'Cancelled recurrence exception task', 60, now() + interval '90 days', true),
  ('dededede-dede-dede-dede-dededededede', '99999999-9999-9999-9999-999999999999',
   'Adjacent event task', 60, now() + interval '90 days', true),
  ('efefefef-efef-efef-efef-efefefefefef', '99999999-9999-9999-9999-999999999999',
   'One-off conflict task', 60, now() + interval '90 days', true),
  ('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', '99999999-9999-9999-9999-999999999999',
   'Zero duration without buffer task', 60, now() + interval '90 days', true),
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1', '99999999-9999-9999-9999-999999999999',
   'Zero duration with buffer task', 60, now() + interval '90 days', true);

insert into public.ai_schedule_requests (
  id, user_id, task_id, status, constraints, target_calendar_id,
  task_version, profile_version, target_calendar_version, candidate_count
)
select fixtures.request_id, t.user_id, fixtures.task_id, 'proposed',
       '{}'::jsonb, c.id, t.updated_at, p.updated_at, c.updated_at, 1
  from (
    values
      ('a7777777-7777-7777-7777-777777777777'::uuid,
       '70707070-7070-7070-7070-707070707070'::uuid),
      ('a8888888-8888-8888-8888-888888888888'::uuid,
       '80808080-8080-8080-8080-808080808080'::uuid),
      ('a9999999-9999-9999-9999-999999999999'::uuid,
       '90909090-9090-9090-9090-909090909090'::uuid),
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
       'abababab-abab-abab-abab-abababababab'::uuid),
      ('acacacac-acac-acac-acac-acacacacacac'::uuid,
       'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd'::uuid),
      ('adadadad-adad-adad-adad-adadadadadad'::uuid,
       'dededede-dede-dede-dede-dededededede'::uuid),
      ('aeaeaeae-aeae-aeae-aeae-aeaeaeaeaeae'::uuid,
       'efefefef-efef-efef-efef-efefefefefef'::uuid),
      ('af0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f'::uuid,
       'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0'::uuid),
      ('af1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f'::uuid,
       'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'::uuid)
  ) as fixtures(request_id, task_id)
  join public.tasks t on t.id = fixtures.task_id
  join public.profiles p on p.id = t.user_id
  join public.calendars c on c.user_id = t.user_id and c.is_default;

insert into public.ai_schedule_suggestions (
  id, request_id, slot_id, start_at, end_at, score, reason, rank
)
values
  ('b7777777-7777-7777-7777-777777777777',
   'a7777777-7777-7777-7777-777777777777', 'existing-recurring-slot',
   '2099-02-17T14:00:00Z', '2099-02-17T15:00:00Z', 0.95, 'Recurring occurrence.', 1),
  ('b8888888-8888-8888-8888-888888888888',
   'a8888888-8888-8888-8888-888888888888', 'created-recurring-slot',
   '2099-02-24T14:00:00Z', '2099-02-24T15:00:00Z', 0.95, 'New recurring occurrence.', 1),
  ('b9999999-9999-9999-9999-999999999999',
   'a9999999-9999-9999-9999-999999999999', 'changed-recurring-slot',
   '2099-03-03T14:00:00Z', '2099-03-03T15:00:00Z', 0.95, 'Changed recurring occurrence.', 1),
  ('babababa-baba-baba-baba-babababababa',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'moved-exception-slot',
   '2099-03-10T14:00:00Z', '2099-03-10T15:00:00Z', 0.95, 'Moved exception slot.', 1),
  ('bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc',
   'acacacac-acac-acac-acac-acacacacacac', 'cancelled-exception-slot',
   '2099-03-17T14:00:00Z', '2099-03-17T15:00:00Z', 0.95, 'Cancelled exception slot.', 1),
  ('bdbdbdbd-bdbd-bdbd-bdbd-bdbdbdbdbdbd',
   'adadadad-adad-adad-adad-adadadadadad', 'adjacent-slot',
   '2099-03-18T14:00:00Z', '2099-03-18T15:00:00Z', 0.95, 'Adjacent slot.', 1),
  ('bebebebe-bebe-bebe-bebe-bebebebebebe',
   'aeaeaeae-aeae-aeae-aeae-aeaeaeaeaeae', 'one-off-conflict-slot',
   '2099-03-19T14:00:00Z', '2099-03-19T15:00:00Z', 0.95, 'One-off conflict slot.', 1),
  ('b0f0f0f0-0f0f-0f0f-0f0f-0f0f0f0f0f0f',
   'af0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f', 'zero-no-buffer-slot',
   '2099-03-20T14:00:00Z', '2099-03-20T15:00:00Z', 0.95, 'Zero duration no buffer.', 1),
  ('b1f1f1f1-1f1f-1f1f-1f1f-1f1f1f1f1f1f',
   'af1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f', 'zero-buffered-slot',
   '2099-03-21T14:00:00Z', '2099-03-21T15:00:00Z', 0.95, 'Zero duration with buffer.', 1);

select is(
  (select count(*)::int from public.profiles
    where id = '99999999-9999-9999-9999-999999999999'),
  1,
  'recurrence fixture has a provisioned profile'
);

-- The raw master is on February 10; only its Tuesday occurrence on February
-- 17 overlaps the proposal.
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, recurrence_rule,
  source_type, provider_event_id
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Existing weekly master',
       '2099-02-10T14:00:00Z', '2099-02-10T15:00:00Z', 'UTC',
       'FREQ=WEEKLY;BYDAY=TU', 'google', 'series-existing'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'b7777777-7777-7777-7777-777777777777')),
  'stale',
  'a recurring master occurrence overlapping the proposal is rejected'
);

select is(
  (select count(*)::int from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Existing recurring master task'),
  0,
  'an overlapping recurring master creates no confirmation event'
);

delete from public.events
 where user_id = '99999999-9999-9999-9999-999999999999'
   and provider_event_id = 'series-existing';

-- Create the recurring event after the proposal was persisted. This is the
-- race-window shape: the final transaction must see the occurrence, not only
-- the master's February 10 raw interval.
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, recurrence_rule,
  source_type, provider_event_id
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Created weekly master',
       '2099-02-10T14:00:00Z', '2099-02-10T15:00:00Z', 'UTC',
       'FREQ=WEEKLY;BYDAY=TU', 'google', 'series-created'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'b8888888-8888-8888-8888-888888888888')),
  'stale',
  'a recurring event created after proposal generation is rejected'
);

select is(
  (select count(*)::int from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Created recurring master task'),
  0,
  'a race-window recurring conflict creates no confirmation event'
);

delete from public.events
 where user_id = '99999999-9999-9999-9999-999999999999'
   and provider_event_id = 'series-created';

-- Change a previously one-off provider row into a series after the proposal
-- was persisted. The master row still starts on February 10, while its March
-- 3 occurrence is the conflicting interval.
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone,
  source_type, provider_event_id
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Changed weekly master',
       '2099-02-10T14:00:00Z', '2099-02-10T15:00:00Z', 'UTC',
       'google', 'series-changed'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

update public.events
   set recurrence_rule = 'FREQ=WEEKLY;BYDAY=TU'
 where user_id = '99999999-9999-9999-9999-999999999999'
   and provider_event_id = 'series-changed';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'b9999999-9999-9999-9999-999999999999')),
  'stale',
  'a recurring event changed after proposal generation is rejected'
);

select is(
  (select count(*)::int from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Changed recurring master task'),
  0,
  'a changed recurring conflict creates no confirmation event'
);

delete from public.events
 where user_id = '99999999-9999-9999-9999-999999999999'
   and provider_event_id = 'series-changed';

-- A moved exception replaces the March 10 Tuesday occurrence with a 16:00
-- block, so the original 14:00 proposal remains safely confirmable.
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, recurrence_rule,
  source_type, provider_event_id
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Exception series',
       '2099-03-03T14:00:00Z', '2099-03-03T15:00:00Z', 'UTC',
       'FREQ=WEEKLY;BYDAY=TU', 'google', 'series-exceptions'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, status,
  source_type, provider_event_id, recurring_event_id, recurrence_original_start_at
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Moved exception',
       '2099-03-10T16:00:00Z', '2099-03-10T17:00:00Z', 'UTC', 'confirmed',
       'google', 'exception-moved', 'series-exceptions', '2099-03-10T14:00:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'babababa-baba-baba-baba-babababababa')),
  'accepted',
  'a moved recurrence exception leaves the original slot free'
);

select is(
  (select status::text from public.tasks
    where id = 'abababab-abab-abab-abab-abababababab'),
  'scheduled',
  'the moved-exception confirmation schedules its task'
);

delete from public.events
 where user_id = '99999999-9999-9999-9999-999999999999'
   and provider_event_id = 'series-exceptions';

-- A cancelled exception suppresses the March 17 generated occurrence.
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, recurrence_rule,
  source_type, provider_event_id
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Cancelled exception series',
       '2099-03-03T14:00:00Z', '2099-03-03T15:00:00Z', 'UTC',
       'FREQ=WEEKLY;BYDAY=TU', 'google', 'series-cancelled'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, status,
  source_type, provider_event_id, recurring_event_id, recurrence_original_start_at
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Cancelled exception',
       '2099-03-17T14:00:00Z', '2099-03-17T14:00:00Z', 'UTC', 'cancelled',
       'google', 'exception-cancelled', 'series-cancelled', '2099-03-17T14:00:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc')),
  'accepted',
  'a cancelled recurrence exception leaves the original slot free'
);

select is(
  (select count(*)::int from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Cancelled recurrence exception task'),
  1,
  'the cancelled exception confirmation creates one event'
);

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc')),
  'accepted',
  'repeating confirmation remains idempotent after recurrence checks'
);

select is(
  (select event_id from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc')),
  (select accepted_event_id from public.ai_schedule_requests
    where id = 'acacacac-acac-acac-acac-acacacacacac'),
  'repeating recurrence confirmation returns its canonical event'
);

select is(
  (select count(*)::int from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Cancelled recurrence exception task'),
  1,
  'repeating recurrence confirmation creates no duplicate'
);

insert into public.events (user_id, calendar_id, title, start_at, end_at)
select '99999999-9999-9999-9999-999999999999', c.id, 'One-off conflict',
       '2099-03-19T14:00:00Z', '2099-03-19T15:00:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'bebebebe-bebe-bebe-bebe-bebebebebebe')),
  'stale',
  'an ordinary one-off overlap remains rejected'
);

insert into public.events (user_id, calendar_id, title, start_at, end_at)
select '99999999-9999-9999-9999-999999999999', c.id, 'Adjacent event',
       '2099-03-18T13:00:00Z', '2099-03-18T14:00:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'bdbdbdbd-bdbd-bdbd-bdbd-bdbdbdbdbdbd')),
  'accepted',
  'an adjacent non-overlapping event remains accepted'
);

select is(
  (select count(*)::int from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Adjacent event task'),
  1,
  'the adjacent confirmation creates one event'
);

select is(
  (select start_at from public.events
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Adjacent event task'),
  '2099-03-18T14:00:00Z'::timestamptz,
  'the adjacent confirmation keeps the exact proposed start'
);

insert into public.events (user_id, calendar_id, title, start_at, end_at)
select '99999999-9999-9999-9999-999999999999', c.id, 'Empty event without buffer',
       '2099-03-20T14:30:00Z', '2099-03-20T14:30:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'b0f0f0f0-0f0f-0f0f-0f0f-0f0f0f0f0f0f')),
  'accepted',
  'a zero-duration event does not block without a buffer'
);

insert into public.events (user_id, calendar_id, title, start_at, end_at)
select '99999999-9999-9999-9999-999999999999', c.id, 'Empty event with buffer',
       '2099-03-21T14:30:00Z', '2099-03-21T14:30:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

update public.ai_schedule_requests
   set constraints = jsonb_build_object('bufferMinutes', 15)
 where id = 'af1f1f1f-1f1f-1f1f-1f1f-1f1f1f1f1f1f';

select is(
  (select status from public.confirm_ai_schedule_suggestion(
    '99999999-9999-9999-9999-999999999999',
    'b1f1f1f1-1f1f-1f1f-1f1f-1f1f1f1f1f1f')),
  'stale',
  'a zero-duration event blocks when the persisted buffer grows it'
);

-- DST fall-back ambiguous local time alignment with @cal/domain
-- 01:30 local in America/New_York on fall-back day 2026-11-01 occurs at 05:30:00Z (EDT) and 06:30:00Z (EST).
-- @cal/domain resolves ambiguous fall-back times to the earlier (daylight) occurrence at 05:30:00Z.
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, recurrence_rule, source_type
)
select '99999999-9999-9999-9999-999999999999', c.id, 'DST fall-back daily series',
       '2026-10-30T05:30:00Z', '2026-10-30T06:30:00Z', 'America/New_York', 'FREQ=DAILY', 'internal'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  public.ai_event_conflicts_interval(
    '99999999-9999-9999-9999-999999999999',
    '2026-11-01T05:30:00Z',
    '2026-11-01T06:00:00Z',
    0
  ),
  true,
  'DST fall-back resolves ambiguous 01:30 local to the earlier 05:30Z daylight occurrence'
);

select is(
  public.ai_event_conflicts_interval(
    '99999999-9999-9999-9999-999999999999',
    '2026-11-01T06:30:00Z',
    '2026-11-01T07:00:00Z',
    0
  ),
  false,
  'DST fall-back leaves the second 06:30Z standard hour free matching TypeScript engine'
);

-- Moved exception from outside interval into interval causes conflict
insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, recurrence_rule, source_type, provider_event_id
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Series for moved exception',
       '2099-04-01T09:00:00Z', '2099-04-01T10:00:00Z', 'UTC', 'FREQ=WEEKLY;BYDAY=WE', 'google', 'series-moved-outside'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

insert into public.events (
  user_id, calendar_id, title, start_at, end_at, timezone, source_type, recurring_event_id, recurrence_original_start_at
)
select '99999999-9999-9999-9999-999999999999', c.id, 'Moved from April 1 to April 10',
       '2099-04-10T14:00:00Z', '2099-04-10T15:00:00Z', 'UTC', 'google', 'series-moved-outside', '2099-04-01T09:00:00Z'
  from public.calendars c
 where c.user_id = '99999999-9999-9999-9999-999999999999' and c.is_default;

select is(
  public.ai_event_conflicts_interval(
    '99999999-9999-9999-9999-999999999999',
    '2099-04-10T14:15:00Z',
    '2099-04-10T14:45:00Z',
    0
  ),
  true,
  'an exception moved into the checked interval from an original occurrence outside conflicts'
);

select * from finish();
rollback;
