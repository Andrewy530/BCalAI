-- ============================================================================
-- 0008 — Make the provider-identity indexes usable as ON CONFLICT targets.
--
-- Both indexes were created as *partial* unique indexes. Postgres will only
-- infer a partial index for `on conflict (cols)` when the statement repeats the
-- index predicate, and PostgREST's `onConflict` option cannot emit one — so
-- every upsert through the client library failed with 42P10
-- (invalid_column_reference) rather than upserting.
--
-- That broke calendar import (`integrations-import`), every inbound event write
-- (`sync/upsert.ts`), and the local reconciliation after an outward write
-- (`sync/push.ts`) — in other words, the whole sync engine.
--
-- Dropping the predicates costs nothing. Postgres treats NULLs as distinct in a
-- unique index, so a row with a null `provider_account_id` still never
-- conflicts with another: local (non-provider) calendars and events keep
-- exactly the behaviour the predicate was written to give them.
--
-- `sync_jobs_idempotency_idx` is deliberately left partial. It is only ever
-- used from `enqueue_sync_job`, which is SQL and states the predicate itself —
-- the pattern that works.
-- ============================================================================

drop index if exists public.calendars_provider_identity_idx;

create unique index calendars_provider_identity_idx
  on public.calendars (provider_account_id, provider_calendar_id);

comment on index public.calendars_provider_identity_idx is
  'One local calendar per provider calendar. Not partial: PostgREST upserts infer this index.';

drop index if exists public.events_provider_identity_idx;

create unique index events_provider_identity_idx
  on public.events (provider_account_id, provider_event_id);

comment on index public.events_provider_identity_idx is
  'One local event per provider event. Not partial: PostgREST upserts infer this index.';
