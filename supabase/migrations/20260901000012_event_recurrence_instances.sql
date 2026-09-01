-- ============================================================================
-- 0012 — Provider recurrence-instance metadata.
--
-- Google returns modified instances alongside a stored series master, while
-- Microsoft calendarView/delta returns expanded occurrences and exceptions.
-- Keep the provider event id of the series master and the original occurrence
-- instant so the client can apply overrides without guessing from titles or
-- current start times.
-- ============================================================================

alter table public.events
  add column recurring_event_id text,
  add column recurrence_original_start_at timestamptz;

create index events_recurrence_instance_idx
  on public.events (provider_account_id, recurring_event_id)
  where recurring_event_id is not null;

comment on column public.events.recurring_event_id is
  'Provider event id of the recurring series master for an occurrence or exception.';
comment on column public.events.recurrence_original_start_at is
  'Original scheduled occurrence instant, before an exception was moved.';
