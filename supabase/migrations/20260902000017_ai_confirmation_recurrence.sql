-- ============================================================================
-- 0017 — Recurrence-aware final confirmation conflict checks.
--
-- The Edge Function already uses the shared domain recurrence expansion. The
-- confirmation transaction must make the same safety decision after acquiring
-- the per-user event-write lock: a recurring master row's raw start/end is not
-- necessarily the interval occupied by one of its occurrences.
--
-- This migration adds a deliberately narrow SQL recurrence predicate for the
-- supported RRULE subset and provider exception representation. It is a final
-- transaction safety boundary, not a replacement for the domain availability
-- engine or the server-side candidate revalidation.
-- ============================================================================

create or replace function public.ai_recurrence_date_matches(
  p_rule text,
  p_anchor_date date,
  p_candidate_date date
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rule text := upper(trim(coalesce(p_rule, '')));
  v_part text;
  v_key text;
  v_value text;
  v_freq text;
  v_interval_text text;
  v_count_text text;
  v_until_text text;
  v_byday text;
  v_bymonthday text;
  v_bymonth text;
  v_wkst text := 'MO';
  v_has_wkst boolean := false;
  v_interval integer := 1;
  v_candidate_dow integer;
  v_anchor_dow integer;
  v_wkst_dow integer;
  v_week_start date;
  v_anchor_week_start date;
  v_month_diff integer;
  v_year_diff integer;
  v_weekday_code text;
  v_ordinal_text text;
  v_ordinal integer;
  v_unique boolean;
begin
  if p_anchor_date is null or p_candidate_date is null then
    return null;
  end if;

  if left(v_rule, 6) = 'RRULE:' then
    v_rule := substring(v_rule from 7);
  end if;
  if v_rule = '' then
    return null;
  end if;

  -- Parse each property explicitly. Unknown properties and duplicate
  -- properties are rejected rather than silently changing the series shape.
  for v_part in select regexp_split_to_table(v_rule, ';') loop
    if v_part !~ '^[A-Z]+=[^;=]+$' then
      return null;
    end if;

    v_key := split_part(v_part, '=', 1);
    v_value := split_part(v_part, '=', 2);

    case v_key
      when 'FREQ' then
        if v_freq is not null then return null; end if;
        v_freq := v_value;
      when 'INTERVAL' then
        if v_interval_text is not null then return null; end if;
        v_interval_text := v_value;
      when 'COUNT' then
        if v_count_text is not null then return null; end if;
        v_count_text := v_value;
      when 'UNTIL' then
        if v_until_text is not null then return null; end if;
        v_until_text := v_value;
      when 'BYDAY' then
        if v_byday is not null then return null; end if;
        v_byday := v_value;
      when 'BYMONTHDAY' then
        if v_bymonthday is not null then return null; end if;
        v_bymonthday := v_value;
      when 'BYMONTH' then
        if v_bymonth is not null then return null; end if;
        v_bymonth := v_value;
      when 'WKST' then
        if v_has_wkst then return null; end if;
        v_has_wkst := true;
        v_wkst := v_value;
      else
        return null;
    end case;
  end loop;

  if v_freq not in ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY') then
    return null;
  end if;

  if v_interval_text is not null then
    if v_interval_text !~ '^[1-9][0-9]{0,8}$' then return null; end if;
    v_interval := v_interval_text::integer;
  end if;

  if v_count_text is not null and v_count_text !~ '^[1-9][0-9]{0,8}$' then
    return null;
  end if;
  if v_until_text is not null
     and v_until_text !~ '^([0-9]{8}|[0-9]{8}T[0-9]{6}Z)$' then
    return null;
  end if;
  if v_count_text is not null and v_until_text is not null then
    return null;
  end if;

  if v_byday is not null then
    select count(*) = count(distinct token)
      into v_unique
      from regexp_split_to_table(v_byday, ',') as parts(token);
    if not v_unique then return null; end if;
  end if;

  if v_bymonthday is not null then
    if v_bymonthday !~ '^([1-9]|[12][0-9]|3[01])(,([1-9]|[12][0-9]|3[01]))*$' then
      return null;
    end if;
    select count(*) = count(distinct token)
      into v_unique
      from regexp_split_to_table(v_bymonthday, ',') as parts(token);
    if not v_unique then return null; end if;
  end if;

  if v_bymonth is not null and v_bymonth !~ '^([1-9]|1[0-2])$' then
    return null;
  end if;
  if v_has_wkst and v_freq <> 'WEEKLY' then
    return null;
  end if;
  if v_wkst not in ('SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA') then
    return null;
  end if;

  case v_freq
    when 'DAILY' then
      if v_has_wkst or v_byday is not null or v_bymonthday is not null or v_bymonth is not null then
        return null;
      end if;
    when 'WEEKLY' then
      if v_bymonthday is not null or v_bymonth is not null then return null; end if;
      if v_byday is not null
         and v_byday !~ '^(SU|MO|TU|WE|TH|FR|SA)(,(SU|MO|TU|WE|TH|FR|SA))*$' then
        return null;
      end if;
    when 'MONTHLY' then
      if v_bymonth is not null then return null; end if;
      if v_byday is not null then
        if v_bymonthday is not null
           or v_byday !~ '^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$' then
          return null;
        end if;
      end if;
    when 'YEARLY' then
      if v_bymonth is null then
        if v_byday is not null or v_bymonthday is not null then return null; end if;
      elsif v_bymonthday is not null and v_byday is not null then
        return null;
      elsif v_bymonthday is not null
            and v_bymonthday !~ '^([1-9]|[12][0-9]|3[01])$' then
        return null;
      elsif v_byday is not null
            and v_byday !~ '^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$' then
        return null;
      elsif v_bymonthday is null and v_byday is null then
        return null;
      end if;
    else
      return null;
  end case;

  if p_candidate_date < p_anchor_date then return false; end if;

  v_candidate_dow := extract(dow from p_candidate_date)::integer;
  v_anchor_dow := extract(dow from p_anchor_date)::integer;
  v_wkst_dow := case v_wkst
    when 'SU' then 0
    when 'MO' then 1
    when 'TU' then 2
    when 'WE' then 3
    when 'TH' then 4
    when 'FR' then 5
    when 'SA' then 6
  end;
  v_weekday_code := case v_candidate_dow
    when 0 then 'SU'
    when 1 then 'MO'
    when 2 then 'TU'
    when 3 then 'WE'
    when 4 then 'TH'
    when 5 then 'FR'
    when 6 then 'SA'
  end;

  case v_freq
    when 'DAILY' then
      return ((p_candidate_date - p_anchor_date) % v_interval) = 0;

    when 'WEEKLY' then
      v_week_start := p_candidate_date - ((v_candidate_dow - v_wkst_dow + 7) % 7);
      v_anchor_week_start := p_anchor_date - ((v_anchor_dow - v_wkst_dow + 7) % 7);
      if v_week_start < v_anchor_week_start
         or ((v_week_start - v_anchor_week_start) % (v_interval * 7)) <> 0 then
        return false;
      end if;
      if v_byday is null then
        return v_candidate_dow = v_anchor_dow;
      end if;
      return position(',' || v_weekday_code || ',' in ',' || v_byday || ',') > 0;

    when 'MONTHLY' then
      v_month_diff := (
        extract(year from p_candidate_date)::integer * 12
        + extract(month from p_candidate_date)::integer
      ) - (
        extract(year from p_anchor_date)::integer * 12
        + extract(month from p_anchor_date)::integer
      );
      if v_month_diff < 0 or (v_month_diff % v_interval) <> 0 then return false; end if;

      if v_byday is not null then
        v_ordinal_text := substring(v_byday from '^(-1|[1-4])');
        v_ordinal := v_ordinal_text::integer;
        if v_candidate_dow <> (case right(v_byday, 2)
          when 'SU' then 0 when 'MO' then 1 when 'TU' then 2 when 'WE' then 3
          when 'TH' then 4 when 'FR' then 5 when 'SA' then 6 end) then
          return false;
        end if;
        if v_ordinal = -1 then
          return p_candidate_date + 7 >
            (date_trunc('month', p_candidate_date::timestamp)::date + interval '1 month - 1 day')::date;
        end if;
        return 1 + ((extract(day from p_candidate_date)::integer - 1) / 7) = v_ordinal;
      end if;

      if v_bymonthday is not null then
        return position(',' || (extract(day from p_candidate_date)::integer)::text || ','
          in ',' || v_bymonthday || ',') > 0;
      end if;
      return extract(day from p_candidate_date)::integer = extract(day from p_anchor_date)::integer;

    when 'YEARLY' then
      v_year_diff := extract(year from p_candidate_date)::integer
        - extract(year from p_anchor_date)::integer;
      if v_year_diff < 0 or (v_year_diff % v_interval) <> 0 then return false; end if;

      if v_bymonth is null then
        return extract(month from p_candidate_date)::integer = extract(month from p_anchor_date)::integer
          and extract(day from p_candidate_date)::integer = extract(day from p_anchor_date)::integer;
      end if;
      if extract(month from p_candidate_date)::integer <> v_bymonth::integer then return false; end if;

      if v_byday is null then
        return position(',' || (extract(day from p_candidate_date)::integer)::text || ','
          in ',' || v_bymonthday || ',') > 0;
      end if;

      v_ordinal_text := substring(v_byday from '^(-1|[1-4])');
      v_ordinal := v_ordinal_text::integer;
      if v_candidate_dow <> (case right(v_byday, 2)
        when 'SU' then 0 when 'MO' then 1 when 'TU' then 2 when 'WE' then 3
        when 'TH' then 4 when 'FR' then 5 when 'SA' then 6 end) then
        return false;
      end if;
      if v_ordinal = -1 then
        return p_candidate_date + 7 >
          (date_trunc('month', p_candidate_date::timestamp)::date + interval '1 month - 1 day')::date;
      end if;
      return 1 + ((extract(day from p_candidate_date)::integer - 1) / 7) = v_ordinal;
  end case;

  return null;
end;
$$;

revoke all on function public.ai_recurrence_date_matches(text, date, date)
  from public, anon, authenticated;

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

    -- Event time zones are validated by normal domain/provider paths. An old
    -- malformed row must not make the final safety boundary optimistic.
    if not exists (
      select 1 from pg_catalog.pg_timezone_names zone where zone.name = v_event.timezone
    ) then
      return true;
    end if;

    v_rule := upper(trim(v_event.recurrence_rule));
    if left(v_rule, 6) = 'RRULE:' then v_rule := substring(v_rule from 7); end if;
    v_count_text := null;
    v_until_text := null;
    for v_part in select regexp_split_to_table(v_rule, ';') loop
      v_key := split_part(v_part, '=', 1);
      v_value := split_part(v_part, '=', 2);
      if v_key = 'COUNT' then v_count_text := v_value; end if;
      if v_key = 'UNTIL' then v_until_text := v_value; end if;
    end loop;

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

-- Replace only the database-side conflict decision; all existing lock,
-- ownership, idempotency, linkage, and rollback behavior remains intact.
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
