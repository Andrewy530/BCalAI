-- ============================================================================
-- 0018 — Phase 4 confirmation hardening: recurrence performance, DST alignment,
--        and suggestion start-time defense in depth.
--
-- 1. Optimize ai_event_conflicts_interval:
--    - Replace pg_catalog.pg_timezone_names scan with fast internal timezone test.
--    - Filter outer event scan to only overlapping one-offs, exceptions, and series.
--    - Early-exit expired recurring series (UNTIL/COUNT prior to scan window).
--    - Align ambiguous DST fall-back local times with @cal/domain.
-- 2. Harden confirm_ai_schedule_suggestion:
--    - Guard against suggestion start times that have passed before RPC execution.
-- ============================================================================

create or replace function public.ai_event_conflicts_interval(
  p_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_buffer_minutes integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_rule text;
  v_part text;
  v_key text;
  v_value text;
  v_freq text;
  v_interval integer := 1;
  v_interval_text text;
  v_count_text text;
  v_until_text text;
  v_count integer;
  v_until_date date;
  v_until_at timestamptz;
  v_block_start timestamptz;
  v_block_end timestamptz;
  v_anchor_local timestamp;
  v_anchor_date date;
  v_anchor_time time;
  v_scan_start_date date;
  v_scan_end_date date;
  v_cursor_date date;
  v_occurrence_start timestamptz;
  v_occurrence_end timestamptz;
  v_actual_start timestamptz;
  v_actual_end timestamptz;
  v_duration_seconds numeric;
  v_occurrence_index integer := 0;
  v_guard integer := 0;
  v_matches boolean;
  v_override_status public.event_status;
  v_override_start timestamptz;
  v_override_end timestamptz;
  v_max_date date;
begin
  -- Invalid inputs fail closed. The confirmation RPC only supplies validated
  -- values, but this helper is deliberately safe if called independently.
  if p_user_id is null or p_start_at is null or p_end_at is null
     or p_end_at <= p_start_at
     or p_buffer_minutes is null
     or p_buffer_minutes < 0
     or p_buffer_minutes > 120 then
    return true;
  end if;

  v_block_start := p_start_at - make_interval(mins => p_buffer_minutes);
  v_block_end := p_end_at + make_interval(mins => p_buffer_minutes);

  for v_event in
    select e.*
      from public.events e
     where e.user_id = p_user_id
       and e.status <> 'cancelled'
       and (
         e.recurrence_rule is not null
         or (e.start_at < v_block_end and e.end_at > v_block_start)
         or (p_buffer_minutes > 0 and e.start_at = e.end_at and e.start_at >= v_block_start and e.start_at <= v_block_end)
       )
     order by e.id
  loop
    -- The domain interval normalizer drops empty intervals when no buffer is
    -- requested. With a buffer, a zero-duration event becomes a point grown
    -- on both sides and therefore remains a legitimate blocker.
    if p_buffer_minutes = 0 and v_event.end_at <= v_event.start_at then
      continue;
    end if;

    -- Materialized provider instances are already at their effective times.
    -- For Google-style exceptions, the master expansion below owns the series;
    -- an active moved instance is still checked directly so a moved occurrence
    -- cannot be missed merely because its original start is outside the slot.
    if v_event.recurring_event_id is not null then
      if v_event.start_at < v_block_end and v_event.end_at > v_block_start then
        return true;
      end if;
      if exists (
        select 1
          from public.events master_event
         where master_event.user_id = p_user_id
           and master_event.calendar_id = v_event.calendar_id
           and master_event.provider_event_id = v_event.recurring_event_id
           and master_event.recurrence_rule is not null
      ) and v_event.source_type <> 'microsoft' then
        continue;
      end if;
      continue;
    end if;

    if v_event.recurrence_rule is null then
      if v_event.start_at < v_block_end and v_event.end_at > v_block_start then
        return true;
      end if;
      continue;
    end if;

    -- Microsoft calendarView rows contain materialized instances. The domain
    -- expansion skips the master whenever any such instance is present.
    if v_event.source_type = 'microsoft'
       and v_event.provider_event_id is not null
       and exists (
         select 1
           from public.events materialized
          where materialized.user_id = p_user_id
            and materialized.calendar_id = v_event.calendar_id
            and materialized.recurring_event_id = v_event.provider_event_id
       ) then
      continue;
    end if;

    -- Event time zones are validated by normal domain/provider paths. Validate
    -- safely using PostgreSQL's internal timezone resolution without disk scans.
    begin
      perform now() at time zone v_event.timezone;
    exception when others then
      return true;
    end;

    v_rule := upper(trim(v_event.recurrence_rule));
    if left(v_rule, 6) = 'RRULE:' then v_rule := substring(v_rule from 7); end if;
    v_count_text := null;
    v_until_text := null;
    v_freq := null;
    v_interval := 1;
    v_interval_text := null;

    for v_part in select regexp_split_to_table(v_rule, ';') loop
      v_key := split_part(v_part, '=', 1);
      v_value := split_part(v_part, '=', 2);
      if v_key = 'FREQ' then v_freq := v_value; end if;
      if v_key = 'INTERVAL' then v_interval_text := v_value; end if;
      if v_key = 'COUNT' then v_count_text := v_value; end if;
      if v_key = 'UNTIL' then v_until_text := v_value; end if;
    end loop;

    if v_freq is null or v_freq not in ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY') then
      return true;
    end if;
    if v_interval_text is not null then
      if v_interval_text !~ '^[1-9][0-9]{0,8}$' then return true; end if;
      v_interval := v_interval_text::integer;
    end if;

    v_count := null;
    if v_count_text is not null then
      if v_count_text !~ '^[1-9][0-9]{0,8}$' then return true; end if;
      v_count := v_count_text::integer;
    end if;

    v_until_date := null;
    v_until_at := null;
    if v_until_text is not null then
      begin
        if v_until_text ~ '^[0-9]{8}$' then
          v_until_date := make_date(
            substring(v_until_text from 1 for 4)::integer,
            substring(v_until_text from 5 for 2)::integer,
            substring(v_until_text from 7 for 2)::integer
          );
          if to_char(v_until_date, 'YYYYMMDD') <> v_until_text then return true; end if;
        elsif v_until_text ~ '^[0-9]{8}T[0-9]{6}Z$' then
          v_until_at := make_timestamptz(
            substring(v_until_text from 1 for 4)::integer,
            substring(v_until_text from 5 for 2)::integer,
            substring(v_until_text from 7 for 2)::integer,
            substring(v_until_text from 10 for 2)::integer,
            substring(v_until_text from 12 for 2)::integer,
            substring(v_until_text from 14 for 2)::integer,
            'UTC'
          );
          if to_char(v_until_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') <> v_until_text then
            return true;
          end if;
        else
          return true;
        end if;
      exception when others then
        return true;
      end;
    end if;

    v_anchor_local := v_event.start_at at time zone v_event.timezone;
    v_anchor_date := v_anchor_local::date;
    -- The shared recurrence helper deliberately anchors generated occurrences
    -- to the event's wall-clock hour/minute and drops sub-minute precision.
    v_anchor_time := make_time(
      extract(hour from v_anchor_local)::integer,
      extract(minute from v_anchor_local)::integer,
      0
    );
    v_duration_seconds := extract(epoch from (v_event.end_at - v_event.start_at));

    -- Scan only local dates whose occurrence could reach the buffered target.
    -- One day of slack covers a timezone offset transition at either edge.
    v_scan_start_date := (
      (v_block_start - (v_duration_seconds * interval '1 second'))
        at time zone v_event.timezone
    )::date - 1;
    v_scan_end_date := (v_block_end at time zone v_event.timezone)::date + 1;

    -- If the series has an UNTIL or COUNT that ends before the scan window,
    -- skip it immediately without looping.
    if v_until_date is not null and v_until_date < v_scan_start_date then
      continue;
    end if;
    if v_until_at is not null and v_until_at < v_block_start then
      continue;
    end if;
    if v_count is not null then
      v_max_date := case v_freq
        when 'DAILY' then v_anchor_date + (v_count * v_interval)
        when 'WEEKLY' then v_anchor_date + (v_count * v_interval * 7 + 7)
        when 'MONTHLY' then (v_anchor_date::timestamp + ((v_count * v_interval + 1) || ' months')::interval)::date
        when 'YEARLY' then (v_anchor_date::timestamp + ((v_count * v_interval + 1) || ' years')::interval)::date
      end;
      if v_max_date < v_scan_start_date then
        continue;
      end if;
    end if;

    v_cursor_date := case
      when v_count is not null then v_anchor_date
      when v_scan_start_date > v_anchor_date then v_scan_start_date
      else v_anchor_date
    end;

    -- The domain expansion has a bounded iteration guard. A malformed or
    -- unusually ancient finite series is rejected conservatively rather than
    -- allowing a scheduler decision without proving the recurrence boundary.
    if v_scan_end_date - v_cursor_date > 20000 then return true; end if;
    v_occurrence_index := 0;
    v_guard := 0;

    while v_cursor_date <= v_scan_end_date loop
      v_guard := v_guard + 1;
      if v_guard > 20000 then return true; end if;

      v_matches := public.ai_recurrence_date_matches(
        v_event.recurrence_rule,
        v_anchor_date,
        v_cursor_date
      );
      if v_matches is null then return true; end if;

      if v_matches then
        v_occurrence_start := (
          v_cursor_date::timestamp + v_anchor_time
        ) at time zone v_event.timezone;

        -- If fall-back creates an ambiguous local time, PostgreSQL defaults to
        -- the standard (later) occurrence. Align with @cal/domain's zonedWallClockToUtc,
        -- which resolves ambiguous fall-back times to the earlier (daylight) occurrence.
        if (v_occurrence_start - interval '1 hour') at time zone v_event.timezone = (v_cursor_date::timestamp + v_anchor_time) then
          v_occurrence_start := v_occurrence_start - interval '1 hour';
        elsif (v_occurrence_start - interval '30 minutes') at time zone v_event.timezone = (v_cursor_date::timestamp + v_anchor_time) then
          v_occurrence_start := v_occurrence_start - interval '30 minutes';
        end if;

        if v_until_date is not null and v_cursor_date > v_until_date then exit; end if;
        if v_until_at is not null and v_occurrence_start > v_until_at then exit; end if;
        if v_count is not null and v_occurrence_index >= v_count then exit; end if;

        -- COUNT counts the generated occurrence even when a provider exception
        -- cancels its effective busy interval.
        v_occurrence_index := v_occurrence_index + 1;
        v_occurrence_end := to_timestamp(
          extract(epoch from v_occurrence_start) + v_duration_seconds
        );
        v_actual_start := v_occurrence_start;
        v_actual_end := v_occurrence_end;
        v_override_status := null;
        v_override_start := null;
        v_override_end := null;

        if v_event.provider_event_id is not null then
          select instance.status, instance.start_at, instance.end_at
            into v_override_status, v_override_start, v_override_end
            from public.events instance
           where instance.user_id = p_user_id
             and instance.calendar_id = v_event.calendar_id
             and instance.recurring_event_id = v_event.provider_event_id
             and instance.recurrence_original_start_at = v_occurrence_start
           order by instance.updated_at desc, instance.id desc
           limit 1;

          if found then
            if v_override_status = 'cancelled' then
              v_cursor_date := v_cursor_date + 1;
              continue;
            end if;
            v_actual_start := v_override_start;
            v_actual_end := v_override_end;
          end if;
        end if;

        if not (p_buffer_minutes = 0 and v_actual_end <= v_actual_start)
           and v_actual_start < v_block_end
           and v_actual_end > v_block_start then
          return true;
        end if;
      end if;

      v_cursor_date := v_cursor_date + 1;
    end loop;
  end loop;

  return false;
end;
$$;

revoke all on function public.ai_event_conflicts_interval(uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;

-- Replace confirm_ai_schedule_suggestion with start-time defense in depth.
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

  if v_request.status = 'accepted' then
    if v_request.accepted_event_id is null or v_suggestion.accepted_at is null then
      return query select 'stale'::text, null::uuid;
      return;
    end if;

    if not exists (
      select 1 from public.events e
       where e.id = v_request.accepted_event_id and e.user_id = p_user_id
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

  -- Defense-in-depth: if the suggestion start time has already passed before the
  -- confirmation transaction executes, reject it as stale.
  if v_suggestion.start_at <= now() then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  select t.* into v_task
    from public.tasks t
   where t.id = v_request.task_id and t.user_id = p_user_id
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

  select p.* into v_profile
    from public.profiles p where p.id = p_user_id for update;
  if not found
     or v_request.profile_version is null
     or v_profile.updated_at <> v_request.profile_version then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  select c.* into v_calendar
    from public.calendars c
   where c.id = v_request.target_calendar_id and c.user_id = p_user_id
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

  if public.ai_event_conflicts_interval(
    p_user_id,
    v_suggestion.start_at,
    v_suggestion.end_at,
    v_buffer_minutes
  ) then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  insert into public.events (
    user_id, calendar_id, title, description, location, start_at, end_at,
    all_day, timezone, status, recurrence_rule, alerts, source_type,
    provider_account_id, provider_event_id, provider_etag, provider_updated_at,
    sync_status
  )
  values (
    p_user_id, v_calendar.id, v_task.title, null, null,
    v_suggestion.start_at, v_suggestion.end_at, false, v_profile.timezone,
    'confirmed', null, '{}'::integer[], 'internal', null, null, null, null,
    'synced'
  )
  returning id into v_event_id;

  update public.tasks
     set status = 'scheduled', scheduled_event_id = v_event_id
   where public.tasks.id = v_task.id and public.tasks.user_id = p_user_id
     and public.tasks.status = 'open'
     and public.tasks.is_flexible and public.tasks.scheduled_event_id is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'confirmation task update failed';
  end if;

  update public.ai_schedule_suggestions
     set accepted_at = now()
   where id = v_suggestion.id and accepted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'confirmation suggestion update failed';
  end if;

  update public.ai_schedule_requests as request_row
     set status = 'accepted', accepted_event_id = v_event_id,
         completed_at = coalesce(completed_at, now()), error_code = null
   where request_row.id = v_request.id and request_row.user_id = p_user_id
     and request_row.status = 'proposed';
  if not found then
    raise exception using errcode = 'P0001', message = 'confirmation request update failed';
  end if;

  return query select 'accepted'::text, v_event_id;
end;
$$;

comment on function public.ai_event_conflicts_interval is
  'Recurrence-aware final conflict predicate for the server-only confirmation transaction.';

comment on function public.confirm_ai_schedule_suggestion is
  'Atomically confirms one persisted AI suggestion into the internal default BCal calendar with recurrence-aware final conflict checks.';
