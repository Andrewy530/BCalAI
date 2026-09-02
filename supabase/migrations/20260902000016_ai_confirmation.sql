-- ============================================================================
-- 0016 — Atomic confirmation of persisted AI scheduling suggestions.
--
-- Phase 4 keeps the frozen Sprint 6 v1 target explicit: the provisioned
-- internal default BCal calendar. The Edge Function performs the shared
-- deterministic revalidation; this function repeats the state/conflict checks
-- and owns every confirmation write in one transaction.
-- ============================================================================

alter table public.ai_schedule_requests
  add column profile_version timestamptz,
  add column target_calendar_version timestamptz,
  add column accepted_event_id uuid references public.events (id) on delete set null;

create unique index ai_schedule_requests_accepted_event_idx
  on public.ai_schedule_requests (accepted_event_id)
  where accepted_event_id is not null;

create unique index ai_schedule_suggestions_one_accepted_idx
  on public.ai_schedule_suggestions (request_id)
  where accepted_at is not null;

-- All event inserts/updates share the confirmation lock. This closes the gap
-- between the final conflict read and the internal event insert for normal
-- client/provider event writes as well as concurrent confirmations.
create or replace function public.lock_user_event_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  return new;
end;
$$;

drop trigger if exists events_serialize_user_writes on public.events;
create trigger events_serialize_user_writes
  before insert or update on public.events
  for each row execute function public.lock_user_event_write();

revoke all on function public.lock_user_event_write() from public, anon, authenticated;

create or replace function public.confirm_ai_schedule_suggestion(
  p_user_id uuid,
  p_suggestion_id uuid
)
returns table(status text, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ai_schedule_requests%rowtype;
  v_suggestion public.ai_schedule_suggestions%rowtype;
  v_task public.tasks%rowtype;
  v_profile public.profiles%rowtype;
  v_calendar public.calendars%rowtype;
  v_event_id uuid;
  v_buffer_minutes integer;
begin
  -- Serialize all confirmation/event writes for this user. Row locks below
  -- serialize task/profile/calendar state changes relevant to this proposal.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select r.*
    into v_request
    from public.ai_schedule_requests r
    join public.ai_schedule_suggestions s on s.request_id = r.id
   where s.id = p_suggestion_id
     and r.user_id = p_user_id
   for update of r;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select s.*
    into v_suggestion
    from public.ai_schedule_suggestions s
   where s.id = p_suggestion_id
   for update;

  -- A retry of the same accepted suggestion is a read of the canonical event,
  -- never a new scheduling attempt. A different suggestion from an accepted
  -- request is stale and cannot create a second block.
  if v_request.status = 'accepted' then
    if v_request.accepted_event_id is null or v_suggestion.accepted_at is null then
      return query select 'stale'::text, null::uuid;
      return;
    end if;

    if not exists (
      select 1
        from public.events e
       where e.id = v_request.accepted_event_id
         and e.user_id = p_user_id
    ) then
      return query select 'stale'::text, null::uuid;
      return;
    end if;

    return query select 'accepted'::text, v_request.accepted_event_id;
    return;
  end if;

  if v_request.status <> 'proposed' or v_suggestion.accepted_at is not null then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  select t.*
    into v_task
    from public.tasks t
   where t.id = v_request.task_id
     and t.user_id = p_user_id
   for update;

  if not found then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  if v_task.status <> 'open'
     or not v_task.is_flexible
     or v_task.scheduled_event_id is not null
     or v_request.task_version is null
     or v_task.updated_at <> v_request.task_version then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  select p.*
    into v_profile
    from public.profiles p
   where p.id = p_user_id
   for update;

  if not found
     or v_request.profile_version is null
     or v_profile.updated_at <> v_request.profile_version then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  select c.*
    into v_calendar
    from public.calendars c
   where c.id = v_request.target_calendar_id
     and c.user_id = p_user_id
   for update;

  if not found
     or v_request.target_calendar_id is null
     or v_request.target_calendar_version is null
     or v_calendar.source_type <> 'internal'
     or not v_calendar.is_default
     or v_calendar.is_read_only
     or v_calendar.updated_at <> v_request.target_calendar_version then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  v_buffer_minutes := coalesce((v_request.constraints ->> 'bufferMinutes')::integer, 0);
  if v_buffer_minutes < 0 or v_buffer_minutes > 120 then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  -- Every non-cancelled event for the user blocks the proposed interval grown
  -- by the persisted buffer, regardless of calendar visibility or source.
  if exists (
    select 1
      from public.events e
     where e.user_id = p_user_id
       and e.status <> 'cancelled'
       and e.start_at < v_suggestion.end_at + make_interval(mins => v_buffer_minutes)
       and e.end_at > v_suggestion.start_at - make_interval(mins => v_buffer_minutes)
  ) then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  insert into public.events (
    user_id,
    calendar_id,
    title,
    description,
    location,
    start_at,
    end_at,
    all_day,
    timezone,
    status,
    recurrence_rule,
    alerts,
    source_type,
    provider_account_id,
    provider_event_id,
    provider_etag,
    provider_updated_at,
    sync_status
  )
  values (
    p_user_id,
    v_calendar.id,
    v_task.title,
    null,
    null,
    v_suggestion.start_at,
    v_suggestion.end_at,
    false,
    v_profile.timezone,
    'confirmed',
    null,
    '{}'::integer[],
    'internal',
    null,
    null,
    null,
    null,
    'synced'
  )
  returning id into v_event_id;

  update public.tasks
     set status = 'scheduled', scheduled_event_id = v_event_id
   where public.tasks.id = v_task.id
     and public.tasks.user_id = p_user_id
     and public.tasks.status = 'open'
     and public.tasks.is_flexible
     and public.tasks.scheduled_event_id is null;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'confirmation task update failed';
  end if;

  update public.ai_schedule_suggestions
     set accepted_at = now()
   where id = v_suggestion.id
     and accepted_at is null;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'confirmation suggestion update failed';
  end if;

  update public.ai_schedule_requests as request_row
     set status = 'accepted',
         accepted_event_id = v_event_id,
         completed_at = coalesce(completed_at, now()),
         error_code = null
   where request_row.id = v_request.id
     and request_row.user_id = p_user_id
     and request_row.status = 'proposed';
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'confirmation request update failed';
  end if;

  return query select 'accepted'::text, v_event_id;
end;
$$;

revoke all on function public.confirm_ai_schedule_suggestion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_ai_schedule_suggestion(uuid, uuid)
  to service_role;

comment on function public.confirm_ai_schedule_suggestion is
  'Atomically confirms one persisted AI suggestion into the internal default BCal calendar.';
