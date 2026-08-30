-- ============================================================================
-- Database-level invariants for scheduling data.
-- Run with: supabase test db
-- ============================================================================

begin;
create extension if not exists pgtap;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'authenticated', 'authenticated', 'carol@example.com', now(), now());

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

-- Back to the owning role so finish() is unaffected by RLS.
reset role;

select * from finish();
rollback;
