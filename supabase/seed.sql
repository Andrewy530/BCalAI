-- ============================================================================
-- Local development seed.
--
-- Applied by `supabase db reset`. Creates one confirmed test user; the auth
-- triggers from migration 0001/0002 give it a profile and default calendar.
--
--   email:    dev@example.com
--   password: password123
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'dev@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Dev Tester"}'::jsonb,
  now(), now()
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values (
  extensions.gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"dev@example.com"}'::jsonb,
  'email', now(), now(), now()
)
on conflict do nothing;

update public.profiles
set timezone = 'America/New_York', week_starts_on = 1
where id = '11111111-1111-1111-1111-111111111111';

insert into public.task_lists (user_id, name, color, position)
values
  ('11111111-1111-1111-1111-111111111111', 'Work', '#6E8BFF', 0),
  ('11111111-1111-1111-1111-111111111111', 'Personal', '#3ECF8E', 1)
on conflict do nothing;

insert into public.tasks (user_id, title, priority, due_at, has_due_time, estimated_minutes)
values
  ('11111111-1111-1111-1111-111111111111', 'Finish supply chain report',
   'high', now() + interval '2 days', false, 90),
  ('11111111-1111-1111-1111-111111111111', 'Book dentist appointment',
   'normal', null, false, 15),
  ('11111111-1111-1111-1111-111111111111', 'Review Q3 forecast',
   'urgent', now() - interval '1 day', true, 45);

insert into public.events (user_id, calendar_id, title, start_at, end_at, timezone)
select
  '11111111-1111-1111-1111-111111111111', c.id, 'Team standup',
  date_trunc('day', now()) + interval '9 hours',
  date_trunc('day', now()) + interval '9 hours 30 minutes',
  'America/New_York'
from public.calendars c
where c.user_id = '11111111-1111-1111-1111-111111111111' and c.is_default;
