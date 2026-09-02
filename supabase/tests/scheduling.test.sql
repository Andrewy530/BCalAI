-- ============================================================================
-- Database-level invariants for scheduling data.
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(9);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'authenticated', 'authenticated', 'carol@example.com', now(), now());

insert into public.tasks (user_id, title, estimated_minutes)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'AI rate-limit fixture', 60);

select throws_ok(
  $$insert into public.events (user_id, calendar_id, title, start_at, end_at)
    select 'cccccccc-cccc-cccc-cccc-cccccccccccc', c.id, 'Backwards',
           now() + interval '1 hour', now()
    from public.calendars c where c.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  '23514', null, 'an event cannot end before it starts'
);

select throws_ok(
  $$insert into public.tasks (user_id, title, has_due_time)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Timed but undated', true)$$,
  '23514', null, 'a task cannot have a due time without a due date'
);

select throws_ok(
  $$insert into public.tasks (user_id, title, status)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Done but undated', 'completed')$$,
  '23514', null, 'a completed task must record when it was completed'
);

select throws_ok(
  $$insert into public.calendars (user_id, name, is_default)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Second default', true)$$,
  '23505', null, 'a user cannot have two default calendars'
);

select throws_ok(
  $$insert into public.calendars (user_id, name, source_type)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Ghost google', 'google')$$,
  '23514', null, 'a synced calendar must carry a provider calendar id'
);

select ok(
  not public.has_active_entitlement('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pro'),
  'a user with no subscription row has no Pro entitlement'
);

create temporary table ai_claim_ids (id uuid) on commit drop;

insert into ai_claim_ids (id)
select public.claim_ai_schedule_request(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  (select id from public.tasks where title = 'AI rate-limit fixture'),
  10
)
from generate_series(1, 10);

select is(
  (select count(*)::int from ai_claim_ids where id is not null),
  10,
  'the atomic AI claim allows ten attempts'
);

select is(
  public.claim_ai_schedule_request(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    (select id from public.tasks where title = 'AI rate-limit fixture'),
    10
  ),
  null::uuid,
  'the eleventh live AI attempt is rate limited'
);

update public.ai_schedule_requests
set status = 'failed', error_code = 'AI_PROVIDER_UNAVAILABLE', completed_at = now()
where id = (select id from ai_claim_ids limit 1);

select ok(
  public.claim_ai_schedule_request(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    (select id from public.tasks where title = 'AI rate-limit fixture'),
    10
  ) is null,
  'a failed attempt still consumes its rolling quota slot'
);

-- Back to the owning role so finish() is unaffected by RLS.
reset role;

select * from finish();
rollback;
