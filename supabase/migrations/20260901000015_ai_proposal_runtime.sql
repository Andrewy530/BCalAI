-- ============================================================================
-- 0015 — AI proposal persistence and atomic request rate limiting.
--
-- Phase 1 only generated ephemeral candidates. Phase 3 needs to keep the
-- exact candidate identity and task/calendar snapshot that the model ranked,
-- while keeping provider metadata server-owned.
-- ============================================================================

alter table public.ai_schedule_requests
  add column target_calendar_id uuid references public.calendars (id) on delete set null,
  add column task_version timestamptz,
  add column candidate_count integer not null default 0,
  add column provider text,
  add column model text,
  add column prompt_version text,
  add column latency_ms integer,
  add column input_tokens integer,
  add column output_tokens integer,
  add column reasoning_tokens integer,
  add column total_tokens integer;

alter table public.ai_schedule_requests
  add constraint ai_request_candidate_count_nonnegative
    check (candidate_count >= 0),
  add constraint ai_request_latency_nonnegative
    check (latency_ms is null or latency_ms >= 0),
  add constraint ai_request_input_tokens_nonnegative
    check (input_tokens is null or input_tokens >= 0),
  add constraint ai_request_output_tokens_nonnegative
    check (output_tokens is null or output_tokens >= 0),
  add constraint ai_request_reasoning_tokens_nonnegative
    check (reasoning_tokens is null or reasoning_tokens >= 0),
  add constraint ai_request_total_tokens_nonnegative
    check (total_tokens is null or total_tokens >= 0);

alter table public.ai_schedule_suggestions
  add column slot_id text not null;

alter table public.ai_schedule_suggestions
  add constraint ai_suggestion_slot_id_nonempty
    check (char_length(trim(slot_id)) > 0);

create unique index ai_schedule_suggestions_slot_idx
  on public.ai_schedule_suggestions (request_id, slot_id);

-- Requests and suggestions are server-managed. The client may read its own
-- rows, but it must not rewrite status, timestamps, candidate identities, or
-- provider metadata through the broad update policy created in 0005.
drop policy "Users update their own AI requests" on public.ai_schedule_requests;

drop policy "Users read suggestions for their own requests"
  on public.ai_schedule_suggestions;

create policy "Users read their proposed AI suggestions"
  on public.ai_schedule_suggestions for select to authenticated
  using (exists (
    select 1
    from public.ai_schedule_requests r
    where r.id = ai_schedule_suggestions.request_id
      and r.user_id = (select auth.uid())
      and r.status in ('proposed', 'accepted')
  ));

-- Claiming the rate-limit slot and inserting the pending request happen under
-- one transaction-level advisory lock. Every valid claimed attempt consumes
-- quota, including no-slot and provider-failed requests.
create or replace function public.claim_ai_schedule_request(
  p_user_id uuid,
  p_task_id uuid,
  p_limit integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_request_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if (
    select count(*)
    from public.ai_schedule_requests
    where user_id = p_user_id
      and created_at >= now() - interval '60 minutes'
  ) >= v_limit then
    return null;
  end if;

  insert into public.ai_schedule_requests (user_id, task_id, status)
  values (p_user_id, p_task_id, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.claim_ai_schedule_request(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ai_schedule_request(uuid, uuid, integer)
  to service_role;

comment on function public.claim_ai_schedule_request is
  'Atomically claims one server-side Find Time attempt for a user.';
