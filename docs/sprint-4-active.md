# Sprint 4 — Active implementation tracker

Status: **In progress**
Last updated: **2026-08-30**

This is the live handoff for the Sprint 4 implementation. Update the
checkboxes, file map, and verification notes as work lands. A different model
should be able to continue from this file plus `AGENTS.md`,
`docs/architecture.md`, and `docs/sync-engine.md` without reconstructing the
sprint from chat history.

## Goal

Make Google Calendar a real connected calendar: OAuth from the app, calendar
selection, initial and incremental sync into `events`, push-notification
webhooks with durable retry, and two-way writes that go to Google first.

The provider-specific code must live behind the `CalendarProvider` interface in
`docs/sync-engine.md` so Sprint 5 can add Microsoft without touching anything
above the adapter.

## Scope

- Provider adapter architecture in `supabase/functions/_shared/providers/`.
- Google OAuth (authorisation code + PKCE) with the refresh token in Vault.
- Calendar list and per-calendar import selection.
- Initial sync, then incremental sync via `nextSyncToken`, with HTTP 410
  handling that falls back to a full resync.
- Google push notification channel: fast acknowledgement, work enqueued to
  `sync_jobs`, channel renewal before expiry.
- Two-way writes: create/update/delete a provider event on Google first, then
  update the local copy.
- Failure and retry states — job backoff, `dead` jobs, an account that needs
  re-authentication, and a user-visible sync health surface.
- Not in this sprint: Microsoft/Graph, AI Find Time, RevenueCat, push
  notifications for background changes, widgets, TestFlight.

## Design decisions taken here

1. **Deno functions do not import `@cal/schemas`.** Provider wire formats are
   provider-specific and are validated by Zod schemas that live next to the
   adapter. The normalised shape the adapter emits is the database row shape,
   which the migration already pins.
2. **The refresh token never leaves the server.** `oauth_states` holds the PKCE
   verifier for the few minutes a connect flow is open; the refresh token goes
   to Vault and `provider_accounts.secret_reference_id` holds only the id.
3. **Sync work is always a job.** Webhooks, cron, and the connect flow all
   enqueue into `sync_jobs`; a single worker drains the queue. This is what
   makes replayed deliveries harmless and failures visible.
4. **Writes are provider-first**, per `docs/sync-engine.md` § Writes. The local
   row is marked `pending`, the provider call runs, and only a confirmed
   provider response promotes it back to `synced`.

## Implementation checklist

- [x] Audit the existing schema, Edge Function helpers, and mobile structure.
- [x] Create this active tracker.
- [ ] Migration 0006: OAuth state, Vault token helpers, job claim/complete
      RPCs, webhook channel lookup index, cron schedules.
- [ ] Provider contract and shared adapter types.
- [ ] Google adapter: token exchange/refresh, calendar list, event list,
      event write, watch channel.
- [ ] Pure normalisation helpers and unit tests in `packages/domain`.
- [ ] Edge Functions: OAuth start/callback, calendar selection, sync worker,
      Google webhook, cron entry point, provider event write, disconnect.
- [ ] Mobile `integrations` feature: API module, hooks, connection screen.
- [ ] Settings connection rows become live; sync health is visible.
- [ ] Event editor routes provider-owned events through the write path.
- [ ] Run formatting, lint, typecheck, and unit tests; record exact results.
- [ ] Device/simulator verification of the OAuth round trip.

## File map for the next model

_Filled in as each slice lands._

## Acceptance criteria

1. A signed-in user can connect a Google account from Settings and see their
   Google calendars listed, with per-calendar import toggles.
2. Selecting a calendar performs an initial sync and its events appear in the
   existing calendar views, coloured and marked as Google-sourced.
3. A change made in Google appears locally without a manual refresh, driven by
   the push channel and reconciled by cron if a notification is missed.
4. An expired sync token resyncs the calendar instead of failing permanently.
5. Editing or deleting a Google-owned event writes to Google first; a failed
   provider write leaves the row visibly unsynced rather than silently
   divergent.
6. A replayed webhook delivery does not duplicate events.
7. A revoked or expired connection surfaces as a re-authenticate state, not a
   silent stall.
8. No refresh token, client secret, or provider payload is ever readable by the
   client or written to a log.

## Verification log

_Recorded as work lands._

## Handoff prompt

> Read `AGENTS.md`, `docs/architecture.md`, `docs/sync-engine.md`, and
> `docs/sprint-4-active.md`. Inspect the current files before editing. Continue
> only unchecked Sprint 4 items, preserve unrelated working-tree changes, update
> this tracker after each completed slice, and run the smallest meaningful
> verification available. Do not start Sprint 5–7 work.
