# Sprint 4 — Active implementation tracker

Status: **Implementation complete; live Google OAuth, import, sync, and provider-first writes verified. Real webhook delivery remains unexercised.**
Last updated: **2026-08-31**

This is the live handoff for the Sprint 4 implementation. Update the
checkboxes, file map, and verification notes as work lands. A different model
should be able to continue from this file plus `AGENTS.md`,
`docs/architecture.md`, and `docs/sync-engine.md` without reconstructing the
sprint from chat history.

## Mac continuation note

The repository was continued on macOS on 2026-08-31. Local database and
simulator smoke checks were run, generated database types and local seed auth
defaults were refreshed, and the iOS tab layout was moved to Expo Router's
native Liquid Glass tabs. Quick Add remains a separate action overlay. The
remaining verification gaps are recorded below.

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

## Known gaps

- `packages/types/src/database.types.ts` was regenerated during the Mac
  continuation; keep it in sync with future schema changes.
- Recurring-event _exceptions_ are imported as individual provider events, but
  Google's `EXDATE`/`RDATE` lines are dropped when the master's RRULE is stored.
  A deleted single occurrence therefore relies on its own tombstone arriving.
  Worth a targeted test once the stack runs.
- `sync-run` drains the queue inside the request, which is fine for a handful of
  calendars and will need moving to a background invocation if a user connects
  many.
- No Sentry breadcrumbs on the sync path yet; failures are console codes only.

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
- [x] Migration 0006: OAuth state, Vault token helpers, job claim/complete RPCs,
      webhook channel lookup index, client-safe health view.
- [x] Migration 0007: the four cron schedules, guarded for local stacks.
- [x] Provider contract and shared adapter types.
- [x] Google adapter: token exchange/refresh, calendar list, event list,
      event write, watch channel.
- [x] Normalisation unit tests (Deno).
- [x] Edge Functions: OAuth start/callback, calendar selection, import, sync
      worker, Google webhook, cron entry point, provider event write, disconnect.
- [x] Mobile `integrations` feature: API module, hooks, connection screen.
- [x] Settings connection rows become live; sync health is visible.
- [x] Event editor routes provider-owned events through the write path.
- [x] Account deletion revokes for real, replacing the Sprint 4/5 TODO.
- [x] **Complete the monorepo formatting, lint, typecheck, and unit-test pass.**
      `pnpm verify` passes locally.
- [x] Fix the Deno typecheck error in `integrations-import/index.ts`; Deno
      check and tests now pass.
- [x] Reset the local Supabase database and pass the database/RLS test suite
      (20 tests).
- [x] Create the ignored `apps/mobile/.env` from
      `apps/mobile/.env.example` with the local Supabase URL and anon key.
- [x] Build and launch the native iOS development client against the local
      Metro server, sign in with the seeded account, and load the Today data.
- [x] Move Quick Add above the native tab bar and reduce the visible navigation
      to Today, Calendar, Tasks, and Settings; simulator interaction verified.
- [x] Register the Google Cloud OAuth client and set the new secrets.
- [x] Verify the OAuth round trip end to end (done against the live Google
      API from the local stack; the iOS client build is still unexercised).
- [x] Exercise an outward provider write against Google.
- [ ] Exercise a real webhook delivery (needs an HTTPS tunnel or a deployed
      project; `127.0.0.1` cannot receive Google push notifications).

## File map for the next model

### The provider boundary

- `supabase/functions/_shared/providers/types.ts` — the contract. `CalendarProvider`
  for sync and writes, `ProviderAuth` for the connect flow.
- `supabase/functions/_shared/providers/registry.ts` — the only place a provider
  kind becomes an implementation. **This is the entire Sprint 5 seam.**
- `supabase/functions/_shared/providers/accounts.ts` — access-token resolution
  through Vault, and connection health.
- `supabase/functions/_shared/providers/disconnect.ts` — releasing a grant.
  Shared by explicit disconnect and account deletion, which must not differ.
- `supabase/functions/_shared/providers/google/` — `auth`, `client`, `config`,
  `normalise` (+ tests), `provider`, `schemas`, `wire`.
- `supabase/functions/_shared/time/zoned.ts` — a deliberate, documented mirror of
  `packages/domain/src/time/timezone.ts`. Deno cannot import the domain package
  because it uses extensionless relative imports.

### The sync engine

- `supabase/functions/_shared/sync/engine.ts` — one calendar's sync, cursor to
  rows, and watch registration. Provider-agnostic.
- `supabase/functions/_shared/sync/upsert.ts` — idempotent writes into `events`.
  Has no outward path at all, which is why an inbound event cannot loop.
- `supabase/functions/_shared/sync/push.ts` — provider-first writes.
- `supabase/functions/_shared/sync/worker.ts` — the only consumer of `sync_jobs`.
- `supabase/functions/_shared/sync/jobs.ts` — enqueue/claim/complete + the
  minute-bucketed idempotency key that collapses webhook bursts.
- `supabase/functions/_shared/sync/window.ts` — how much calendar we import, and
  where each provider posts notifications.

### Edge Functions

| Function                  | JWT    | Purpose                                                      |
| ------------------------- | ------ | ------------------------------------------------------------ |
| `oauth-google-start`      | yes    | Mint PKCE + state, return the consent URL                    |
| `oauth-google-callback`   | **no** | Exchange the code, store the token, 302 into the app         |
| `integrations-calendars`  | yes    | List an account's calendars and what is imported             |
| `integrations-import`     | yes    | Import/drop one calendar; first sync runs after the response |
| `integrations-disconnect` | yes    | Stop channels, revoke, delete                                |
| `provider-event-write`    | yes    | Provider-first create/update/delete                          |
| `sync-run`                | yes    | "Sync now" — enqueue and drain in one request                |
| `webhook-google`          | **no** | Verify channel token, enqueue, acknowledge fast              |
| `sync-cron`               | **no** | `?task=renew-watches\|retry-failed\|reconcile\|prune`        |

### Mobile

- `apps/mobile/src/features/integrations/api/integrations.api.ts` — the only
  module that knows how connections are read and changed.
- `apps/mobile/src/features/integrations/hooks/useConnectProvider.ts` — the
  OAuth round trip via `WebBrowser.openAuthSessionAsync`.
- `apps/mobile/src/features/integrations/hooks/useIntegrations.ts` — server state.
- `apps/mobile/src/features/integrations/screens/IntegrationsScreen.tsx` and
  `components/{ConnectionCard,CalendarPickerSheet}.tsx`.
- `apps/mobile/app/settings/integrations.tsx` — also the OAuth return target for
  `calendarapp://settings/integrations`.
- `apps/mobile/src/features/events/hooks/useEvents.ts` — every event mutation now
  asks which calendar owns the row before deciding where the write goes.

### Configuration

New secrets in `.env.example`: `GOOGLE_OAUTH_REDIRECT_URI`, `APP_OAUTH_RETURN_URL`,
`GOOGLE_WEBHOOK_URL`, `SYNC_CRON_SECRET`.

Google Cloud console: register a **Web application** OAuth client (not an iOS
one) whose redirect URI is the callback function. That is what keeps the client
secret server-side and is why Google issues a refresh token at all.

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

### Mac continuation — 2026-08-31

- `pnpm verify`: passed — formatting, ESLint, all six workspace typechecks, and
  129 unit tests.
- Edge Function checks: `deno task check` passed after the typed cast fix in
  `supabase/functions/integrations-import/index.ts:120`.
- Edge Function tests: 15 tests passed.
- Local database reset: all seven migrations applied and seed data loaded.
- Database/RLS tests: 20 tests passed with `supabase test db`.
- Native iOS simulator build: `xcodebuild` succeeded for the iOS 27 simulator;
  Metro bundled successfully after adding the direct Expo runtime dependency
  and restoring hierarchical lookup for pnpm's isolated store.
- Mobile local-auth smoke test: the seeded `dev@example.com` account signed in
  and the Today dashboard loaded seeded events and free-time data.
- Navigation UI smoke test: the four-item native tab bar rendered with Quick
  Add at the upper-right above the bar, and the button opened the Quick Add
  sheet successfully.
- The simulator build was unsigned/ad hoc, so `expo-notifications` reported the
  expected missing Keychain entitlement. Notification registration still needs
  a properly provisioned development build.
- The Google OAuth round trip, a real webhook delivery, and an outward provider
  write remain unexercised.

### Google OAuth and sync verified against the live API — 2026-09-01

Run from the local stack with `supabase functions serve --env-file supabase/.env`
against a real Google account (Cloud project `BCalAI Dev`,
OAuth client type Web application, redirect
`http://127.0.0.1:54321/functions/v1/oauth-google-callback`).

- `oauth-google-start` minted PKCE + state and returned a correct consent URL.
- `oauth-google-callback` exchanged the code and logged `provider_connected`.
  `provider_accounts` holds the account as `active`, with all four scopes and a
  non-null `secret_reference_id` — the refresh token reached Vault.
- `integrations-calendars` listed seven real calendars, correctly marking the
  primary as writable and the subscribed/holiday calendars as read-only.
- `integrations-import` imported the primary calendar.
- `sync-run` performed the initial sync: **231 events written**, 20 with an
  RRULE, 31 all-day. A second run went down the `incremental` path from the
  stored cursor and wrote 0 — the cursor round trip works.

**Bug found and fixed: migration 0008.** Both provider-identity indexes were
created as _partial_ unique indexes. Postgres only infers a partial index for
`on conflict (cols)` when the statement repeats the predicate, and PostgREST's
`onConflict` option cannot emit one, so every upsert through the client library
failed with 42P10. This broke `integrations-import`, `sync/upsert.ts` (all
inbound events), and `sync/push.ts` (reconciliation after an outward write) —
the whole engine. Migration 0008 recreates both indexes without the predicate,
which is behaviourally identical because Postgres treats NULLs as distinct.
`sync_jobs_idempotency_idx` is deliberately still partial: it is only used from
`enqueue_sync_job`, which is SQL and states the predicate itself.

**Outward writes verified (acceptance criterion 5).** Through
`provider-event-write` against the primary calendar:

- `create` returned a `providerEventId` and an etag, and the event was
  confirmed present in the Google Calendar web UI at the correct wall-clock
  time (15:00 UTC rendering as 11am EST).
- `update` changed title, location, and time; Google returned a new etag
  (`…171146398` → `…337065086`), so the change was accepted by the provider
  rather than only written locally.
- `delete` removed the provider event and the local row, confirmed by the day
  being empty in the Google Calendar web UI.

All three came back `syncStatus: "synced"`, which is only reachable through a
confirmed provider response.

This is the class of defect that only a live run finds. It had passed
formatting, lint, six typechecks, 129 unit tests, 15 Deno tests, and 20
database tests.

Two local-environment limits worth knowing:

- `[edge_runtime] policy = "oneshot"` kills the isolate once a response is
  sent, so `runAfterResponse` work (the post-import sync) never runs locally.
  Invoke `sync-run` explicitly instead. This is a local artifact, not a bug.
- Google only delivers push notifications to public HTTPS endpoints, so webhook
  delivery cannot be tested against `127.0.0.1`. Needs a tunnel or a deployed
  project.

### Second machine verified — 2026-08-31

The clone at `~/Desktop/Claude Vault/Cal Project App` was brought up from a bare
machine: Xcode 26.6 with iOS 26.5 simulators, Homebrew, Node 26.8.1, pnpm
9.12.0, Deno 2.9.6, Watchman, Docker 29.7.2, and Supabase CLI 2.116.0.
Everything below was re-run independently here and passed:

- `pnpm verify`: formatting, ESLint, all six workspace typechecks, 129 unit
  tests.
- `deno task check`: all twelve Edge Function entry points.
- `deno task test`: 15 tests.
- `supabase start` and `pnpm db:reset`: all seven migrations applied, seed
  loaded.
- `supabase test db`: 20 tests across `rls.test.sql` and `scheduling.test.sql`.
- `pnpm db:types` against the local schema produced no schema change — only a
  trailing newline — which confirms the committed types match the migrations.

Environment notes for the next model:

- Node is 26.8.1, not the 20.18+ the README pins. Nothing has failed on it, but
  Metro/Expo has not yet been exercised on this machine; if bundling misbehaves,
  suspect the Node major before anything in this repo.
- `corepack` is no longer bundled with Node 26, so pnpm was installed via
  Homebrew. It still resolves to the pinned 9.12.0 from `packageManager`.
- Homebrew refuses to build while the standalone Command Line Tools lag the
  macOS version, even with a current Xcode installed. `softwareupdate --install
"Command Line Tools for Xcode <version>-<version>"` is the fix; the label
  repeats the version.

Still unexercised here: the iOS development build, and the Google OAuth round
trip, webhook delivery, and outward provider write.

### Original Sprint 4 handoff state

At the original handoff, the machine had no Node, pnpm, npx, or Deno binary and
no installed `node_modules`, so none of the following had run:

- `pnpm verify` (format, lint, typecheck, test) — not run.
- `tsc --noEmit` for the mobile app or any package — not run.
- `deno check` / `deno task test` for the Edge Functions — not run. The
  normalisation tests in `providers/google/normalise.test.ts` are **written but
  never executed**; treat a failure there as likely a bug in the test.
- `supabase db reset` against migrations 0006 and 0007 — not run.
- The Google OAuth round trip, a real webhook delivery, and an outward write —
  never exercised against Google.

Review was manual: imports were checked against the files they name, and the new
code follows the conventions already in the repo. That is not a substitute for
compiling it.

### What to do first, on a machine with the toolchain

1. Create `apps/mobile/.env` from `apps/mobile/.env.example` using the values
   from `supabase status`; keep server-only values in `supabase/.env`.
2. Register the Google Cloud OAuth client and set the server-side secrets.
3. Build the Expo development client and exercise the complete OAuth/sync
   acceptance flow on the iOS simulator or a device.

## Handoff prompt

> Read `AGENTS.md`, `docs/architecture.md`, `docs/sync-engine.md`, and
> `docs/sprint-4-active.md`. Inspect the current files before editing. Continue
> only unchecked Sprint 4 items, preserve unrelated working-tree changes, update
> this tracker after each completed slice, and run the smallest meaningful
> verification available. Do not start Sprint 5–7 work.
