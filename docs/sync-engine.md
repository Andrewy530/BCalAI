# Sync engine

Status: **Google built in Sprint 4; Microsoft not yet built.** This document is
the contract both implementations satisfy. The live source of truth for the
interface is `supabase/functions/_shared/providers/types.ts`.

## Provider adapter

Google- and Microsoft-specific code lives only behind this interface, in
`supabase/functions/_shared/providers/{google,microsoft}`:

```ts
interface CalendarProvider {
  readonly kind: ProviderKind;
  listCalendars(ctx: ProviderContext): Promise<ExternalCalendar[]>;
  initialSync(ctx, providerCalendarId, window): Promise<SyncResult>;
  incrementalSync(ctx, providerCalendarId, cursor): Promise<SyncResult>;
  createEvent(ctx, providerCalendarId, input): Promise<NormalisedEvent>;
  updateEvent(ctx, providerCalendarId, providerEventId, input): Promise<NormalisedEvent>;
  deleteEvent(ctx, providerCalendarId, providerEventId): Promise<void>;
  watch(ctx, providerCalendarId, callbackUrl): Promise<WatchRegistration>;
  unwatch(ctx, registration): Promise<void>;
}
```

Both normalise into the same internal event model. Nothing above this interface
knows which provider it is talking to — `providers/registry.ts` is the only
place a provider kind becomes a concrete implementation, and Sprint 5 adds
Microsoft by registering two entries there.

Every method takes an explicit `ProviderContext` rather than resolving an
account internally, which is a deviation from the original sketch. Edge
Functions are stateless and an access token is valid for minutes, so the caller
resolves it once per invocation instead of each method re-reading Vault.

OAuth is a second, separate interface (`ProviderAuth`), because the connect flow
runs before any context exists.

## Incremental sync

Google and Microsoft differ in vocabulary but not in shape:

| | Google | Microsoft |
| --- | --- | --- |
| Cursor | `nextSyncToken` | delta link / state token |
| Invalidation | HTTP 410 → full resync | expired token → full resync |
| Change signal | push notification channel | change notification subscription |
| Renewal | recreate the channel before expiry | renew subscription, handle lifecycle events |

Both cursors are stored in `calendar_sync_states.sync_cursor`.

One Google constraint shapes the whole design: `syncToken` and
`timeMin`/`timeMax` are mutually exclusive. The window is therefore fixed at the
initial sync and inherited by every incremental run, so `initialSyncWindow()` in
`_shared/sync/window.ts` is policy, not a parameter.

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

This is structural rather than heuristic: `_shared/sync/upsert.ts` has no path
that writes outward at all, so an inbound event *cannot* start a write loop
regardless of what it contains.

The one case that needs care is the opposite direction — an inbound snapshot
that predates a push still in flight. Rows in `pending` or `failed` are skipped
by the upsert, so a user never watches their own edit revert; the push completes
and the next sync converges.

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

## Authenticating the untrusted callers

Two endpoints run without a user JWT, and each authenticates itself:

| Endpoint | Caller | Proof |
| --- | --- | --- |
| `oauth-google-callback` | the user's browser | single-use `state` row in `oauth_states`, deleted before the code is exchanged |
| `webhook-google` | Google | `X-Goog-Channel-Token`, generated when the channel was created and compared against `calendar_sync_states.webhook_token` |
| `sync-cron` | `pg_cron` | `X-Sync-Cron-Secret`, and the function refuses to run at all if the secret is unset |

The webhook never returns a non-2xx. A failure there is logged and acknowledged,
because teaching Google to back off the channel costs more than the one
notification the daily reconciliation would have caught anyway.

## Cron jobs

| Job | Cadence | Purpose |
| --- | --- | --- |
| Renew webhooks | hourly | Recreate Google channels / renew Graph subscriptions before expiry |
| Retry failed syncs | every 15 min | Drain `sync_jobs` where status = failed |
| Reconcile | daily | Full compare per connected calendar, in case a notification was missed |
| Refresh stale accounts | hourly | Re-auth prompts for `status = 'expired'` |
