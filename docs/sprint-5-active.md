# Sprint 5 — Active implementation tracker

Status: **Not started — blocked on the Sprint 4 gates below**
Last updated: **2026-08-31**

The live handoff for Sprint 5. Same contract as `docs/sprint-4-active.md`:
update the checkboxes, file map, and verification notes as work lands, so a
different model can continue from this file plus `AGENTS.md`,
`docs/architecture.md`, and `docs/sync-engine.md`.

## Goal

Add Microsoft/Outlook as a second real connected calendar: Microsoft OAuth,
a Graph calendar adapter, delta sync, change-notification subscriptions with
renewal, and two-way writes — all behind the existing `CalendarProvider`
interface.

The measure of success is narrow and worth stating plainly: **nothing above
`providers/registry.ts` should need a second code path.** If the sync worker,
the queue, the write path, or the upsert learns the word "microsoft", the
Sprint 4 abstraction was wrong and the fix belongs below the seam, not in a
branch above it.

## Gates — do not start implementation until these clear

- [ ] **A working toolchain on the development machine.** As of 2026-08-31 the
      Mac holding this clone has no Node, pnpm, Deno, or Supabase CLI, no
      installed `node_modules`, and no Xcode (Command Line Tools only). See
      the README Prerequisites table. Without this, Sprint 5 would repeat the
      Sprint 4 mistake of writing code that is reviewed but never compiled.
- [ ] **Sprint 4's Google path verified end to end.** Its last two unchecked
      items — the Google Cloud OAuth client, and a real OAuth round trip on a
      device or simulator — are what prove the seam. The Google adapter has
      never spoken to Google. Building a second adapter on an unexercised
      abstraction means finding any design flaw twice, in twice the code.
- [ ] **Azure app registration.** The Microsoft counterpart to the Google
      console step. Register a **Web** application (not a public client), so
      the client secret stays server-side and the refresh token can go to
      Vault exactly as Google's does. Redirect URI is the callback function.

## What the seam already gets right

Sprint 4 anticipated this sprint in several places. None of these need work:

- `provider_kind` is already an enum of `('google', 'microsoft')` —
  `supabase/migrations/20260830000004_provider_accounts.sql:10`. No migration
  is needed for accounts or sync state.
- `calendar_sync_states.webhook_subscription_id` already exists for Graph's
  subscription id — same migration, line 97.
- `WatchRegistration` already carries both `resourceId` (Google) and
  `subscriptionId` (Graph), and `SyncResult.cursorInvalid` is already
  documented as covering a Graph expired delta token.
- `webhookUrlFor()` derives `MICROSOFT_WEBHOOK_URL` and `webhook-microsoft`
  from the provider kind with no branching — `sync/window.ts`.
- The `renew-watches` cron selects by `webhook_expires_at` and is already
  provider-agnostic.

## Seam defects to fix first

Found by reading the Sprint 4 code against the Microsoft case. Each one is a
place where provider-agnostic code silently assumes Google's channel shape.
Fix these **before** the adapter, as their own slice, so the Microsoft work
does not have to route around them.

- [ ] **`ensureWatch` cannot tear down a Graph subscription.**
      `sync/engine.ts:187` only unwatches when `webhook_resource_id` is set,
      and `:191` hardcodes `subscriptionId: null`. Graph registrations have a
      null `resourceId`, so the old subscription is never stopped — every
      renewal would leave a live orphan delivering into an unknown channel.
      Load and pass `webhook_subscription_id`, and gate on
      `webhook_channel_id` plus _either_ identifier. Note `SYNC_STATE_COLUMNS`
      (`:42`) does not select the subscription column yet.
- [ ] **`stopChannels` has the same defect on disconnect.**
      `providers/disconnect.ts:59` filters on `webhook_resource_id` and `:72`
      hardcodes `subscriptionId: null`, so disconnecting a Microsoft account
      would leave its subscriptions live until they expire.
- [ ] **Google-named error codes on provider-agnostic paths.**
      `GOOGLE_AUTH_EXPIRED` and `GOOGLE_SYNC_CURSOR_INVALID` are thrown and
      compared in `providers/accounts.ts:62,87`, `sync/engine.ts:103,164,221`,
      and `sync/worker.ts:78` — none of which know which provider they are
      serving. Rename to `PROVIDER_AUTH_EXPIRED` and
      `PROVIDER_SYNC_CURSOR_INVALID` in `errors/index.ts` and the mirrored
      `ERROR_CODES` in `packages/types/src/result.ts:19`, keeping the two
      lists identical. The mobile call site at
      `features/integrations/api/integrations.api.ts:181` follows.
- [ ] **The mobile connect flow is Google-only.**
      `startGoogleConnect()` calls `oauth-google-start` by name
      (`integrations.api.ts:117`), and `IntegrationsScreen.tsx:107,127`
      hardcodes the Google label and a `provider === 'google'` check.
      Parameterise by provider kind so the screen can offer both and show
      each connected account once.

## Implementation checklist

- [ ] Clear the three gates above.
- [ ] Fix the four seam defects as one slice, with the Google path re-verified
      afterwards.
- [ ] Microsoft config module: endpoints, scopes, client id/secret accessors,
      redirect URI — mirroring `providers/google/config.ts`.
- [ ] `providers/microsoft/auth.ts` implementing `ProviderAuth`: authorisation
      URL, code exchange with PKCE, refresh, `identify` via `/me`, revoke.
- [ ] `providers/microsoft/client.ts`: authenticated fetch, Graph error
      mapping (401 → auth expired, 410 → cursor invalid, 429 → rate limited
      honouring `Retry-After`).
- [ ] `providers/microsoft/schemas.ts` + `normalise.ts` (+ tests) translating
      Graph's event shape into `NormalisedEvent`.
- [ ] `providers/microsoft/provider.ts` implementing `CalendarProvider`.
- [ ] Register both in `providers/registry.ts`. **This should be the only
      edit above the adapter directory.**
- [ ] Edge Functions `oauth-microsoft-start`, `oauth-microsoft-callback`,
      `webhook-microsoft`.
- [ ] Mobile: provider-parameterised connect and a two-provider Integrations
      screen.
- [ ] Full verification pass: `pnpm verify`, Deno check and tests, database
      tests, and a real OAuth round trip against Microsoft.

## Where Graph differs from Google

The differences that actually shape the adapter, so they are not rediscovered
mid-implementation:

| Concern         | Google                                   | Microsoft Graph                                           |
| --------------- | ---------------------------------------- | --------------------------------------------------------- |
| Incremental     | `syncToken` on `events.list`             | `/calendarView/delta` with a `deltaLink`                  |
| Expired cursor  | HTTP 410                                 | HTTP 410 `syncStateNotFound`                              |
| Window          | `timeMin`/`timeMax`, fixed at first sync | `startDateTime`/`endDateTime` on the delta series         |
| Recurrence      | Master + modified occurrences            | `seriesMaster` + `exception`/`occurrence` types           |
| Recurrence rule | RFC 5545 `RRULE` string                  | A structured `recurrence` object — **must be built**      |
| Deletions       | Tombstone with `status: cancelled`       | `@removed` annotation on the delta entry                  |
| Channel life    | ~1 month max, we ask for 7 days          | ~3 days max for calendars — renewal cron matters far more |
| Channel secret  | `token` echoed in a header               | `clientState` echoed in the body                          |
| Webhook setup   | No handshake beyond a `sync` state       | Must echo `validationToken` as plain text within 10s      |
| Identity        | OpenID `userinfo`                        | `/me` (`id`, `mail` or `userPrincipalName`)               |

Two consequences worth deciding early:

1. **Recurrence is the real work.** `NormalisedEvent.recurrenceRule` is a
   single RRULE line. Graph neither accepts nor emits one, so the adapter owns
   a bidirectional translation between RRULE and Graph's `recurrence` object.
   This is the most likely source of correctness bugs in the sprint and
   deserves unit tests before it is wired to anything.
2. **Three-day subscriptions change the risk profile.** A missed renewal is a
   silently stale calendar within days rather than weeks. The hourly renewal
   cron already exists; the seam defects above must be fixed for it to work at
   all on Graph.

## Acceptance criteria

Sprint 4's eight criteria, restated for Microsoft, plus:

9. A user can connect both a Google and a Microsoft account at once, and each
   calendar syncs and writes independently of the other.
10. Adding Microsoft required no change to `sync/worker.ts`, `sync/jobs.ts`,
    `sync/upsert.ts`, or `sync/push.ts` beyond the shared defect fixes above.

## Verification log

Nothing verified yet — implementation has not started.
