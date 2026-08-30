# Sync engine

Status: **designed, not yet built.** Google lands in Sprint 4, Microsoft in
Sprint 5. This document is the contract both implementations must satisfy.

## Provider adapter

Google- and Microsoft-specific code lives only behind this interface, in
`supabase/functions/_shared/providers/{google,microsoft}`:

```ts
interface CalendarProvider {
  listCalendars(accountId: string): Promise<ExternalCalendar[]>;
  initialSync(calendarId: string): Promise<SyncResult>;
  incrementalSync(calendarId: string, cursor: string): Promise<SyncResult>;
  createEvent(input: ProviderEventInput): Promise<ProviderEvent>;
  updateEvent(providerEventId: string, input: ProviderEventInput): Promise<ProviderEvent>;
  deleteEvent(providerEventId: string): Promise<void>;
  renewWatch?(calendarId: string): Promise<WatchRegistration>;
}
```

Both normalise into the same internal event model. Nothing above this interface
knows which provider it is talking to.

## Incremental sync

Google and Microsoft differ in vocabulary but not in shape:

| | Google | Microsoft |
| --- | --- | --- |
| Cursor | `nextSyncToken` | delta link / state token |
| Invalidation | HTTP 410 → full resync | expired token → full resync |
| Change signal | push notification channel | change notification subscription |
| Renewal | recreate the channel before expiry | renew subscription, handle lifecycle events |

Both cursors are stored in `calendar_sync_states.sync_cursor`.

```
provider webhook  →  Edge Function  →  enqueue sync_job  →  200 OK (fast)
                                            │
                                     incremental sync using cursor
                                            │
                                     normalise provider events
                                            │
                                     idempotent upsert into events
                                            │
                                     store new cursor
```

The webhook acknowledges immediately and does the work asynchronously, because
both providers treat a slow endpoint as a failed delivery.

## Writes

For a provider-owned event:

```
user edits  →  provider mutation FIRST  →  provider confirms  →  update local copy
```

Writing locally first and pushing later produces divergence that users
experience as their calendar "changing back".

## Preventing loops

Every row tracks `provider_event_id`, `provider_etag`, `provider_updated_at`,
and `sync_status`. A webhook that reflects our own recent write **confirms** the
local row rather than triggering a second write outward. The unique index on
`(provider_account_id, provider_event_id)` makes the upsert idempotent, so a
replayed delivery is harmless.

## Reliability

Webhooks are optimisation signals, not truth — Google documents that push
notifications are not perfectly reliable, and Microsoft documents missed-
notification handling. So the system also needs:

- Periodic reconciliation via Supabase Cron.
- Webhook renewal before `webhook_expires_at`.
- Retry with backoff through `sync_jobs`, and a `dead` status for exhausted
  jobs so failures are visible rather than silent.
- A user-visible sync health state — `sync_jobs` is readable by its owner for
  exactly this reason.

## Cron jobs

| Job | Cadence | Purpose |
| --- | --- | --- |
| Renew webhooks | hourly | Recreate Google channels / renew Graph subscriptions before expiry |
| Retry failed syncs | every 15 min | Drain `sync_jobs` where status = failed |
| Reconcile | daily | Full compare per connected calendar, in case a notification was missed |
| Refresh stale accounts | hourly | Re-auth prompts for `status = 'expired'` |
