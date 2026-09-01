# Sprint 5 — Active implementation tracker

Status: **Active — provider-seam cleanup complete; Graph watch-scope prerequisite in progress**
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

## Gates and verification prerequisites

- [x] **A working toolchain on the development machine.** The current Mac has
      Node 26.8.1, Deno 2.9.6, Supabase CLI 2.116.0, Docker 29.7.2, Xcode
      26.6, and installed workspace dependencies. The repository pins
      `pnpm@9.12.0`, while this machine's Homebrew executable is pnpm 11.24.0;
      keep that version mismatch visible when interpreting local results.
- [x] **Sprint 4's Google backend/provider path verified against the live API.**
      OAuth start/callback, Vault-backed refresh-token storage, calendar
      listing, import, a 231-event initial sync, a valid-cursor incremental
      sync, and provider-first create/update/delete were exercised from the
      local stack. The adapter has spoken to Google; these results clear the
      provider seam for local Sprint 5 implementation.
- [ ] **Azure app registration.** The Microsoft counterpart to the Google
      console step. Register a **Web** application (not a public client), so
      the client secret stays server-side and the refresh token can go to
      Vault exactly as Google's does. Redirect URI is the callback function.
      This is required before live Microsoft OAuth and subscription delivery,
      but does not block locally testable seam, adapter, recurrence, or Edge
      Function work.

The remaining Google gaps are narrower than this gate list: the iOS app-side
OAuth/deep-link flow and provider-owned UI write flow have not been exercised;
real Google webhook delivery (including replay/idempotency) has not been
exercised because local `127.0.0.1` is not publicly reachable; and no deliberate
expired-cursor or revoked-credential run has been performed. None blocks local
Microsoft implementation. Azure registration blocks only the corresponding
live Microsoft OAuth/subscription verification.

## What the seam already gets right

Sprint 4 anticipated this sprint in several places. These are useful primitives,
but the Graph watch-scope limitation below means they are not sufficient on
their own:

- `provider_kind` is already an enum of `('google', 'microsoft')` —
  `supabase/migrations/20260830000004_provider_accounts.sql:10`. No migration
  is needed for accounts or sync state.
- `calendar_sync_states.webhook_subscription_id` already exists for Graph's
  subscription id — same migration, line 97 — but its per-calendar placement
  is not sufficient for Graph's mailbox-scoped subscription.
- `WatchRegistration` already carries both `resourceId` (Google) and
  `subscriptionId` (Graph), and `SyncResult.cursorInvalid` is already
  documented as covering a Graph expired delta token. The watch contract still
  needs an explicit account-scope capability for Graph.
- `webhookUrlFor()` derives `MICROSOFT_WEBHOOK_URL` and `webhook-microsoft`
  from the provider kind with no branching — `sync/window.ts`.
- The `renew-watches` cron selects by `webhook_expires_at` and is already
  provider-agnostic, but its current per-calendar renewal is not sufficient for
  Graph account subscriptions.

## Newly verified Graph watch-scope prerequisite

- [ ] **Prerequisite (in progress): redesign Graph watch registration at account
      scope.** Outlook event subscriptions for `/me/events` are mailbox/account
      scoped rather than per-calendar, and Graph disallows duplicate
      subscriptions for the same resource and change type. The existing
      per-calendar watch contract and renewal path therefore cannot be reused
      as-is. Add account-level server-only watch storage, a provider capability
      describing account-scoped watches, and an account-reconciliation webhook
      route. Dropping one imported calendar must remove only that calendar's
      local sync state; it must never delete the account subscription.

## Seam defects resolved in the cleanup slice

Found by reading the Sprint 4 code against the Microsoft case. Each one is a
place where provider-agnostic code silently assumes Google's channel shape.
They were fixed and reviewed as their own slice, so the Microsoft work does not
have to route around them.

- [x] **`ensureWatch` could not tear down a Graph subscription.**
      The pre-cleanup path only unwatched when `webhook_resource_id` was set
      and hardcoded `subscriptionId: null`. Graph registrations have a null
      `resourceId`, so the old subscription could be left live on renewal.
      Teardown now reconstructs the registration from
      `webhook_channel_id` plus either provider identifier, including
      `webhook_subscription_id` in `SYNC_STATE_COLUMNS`.
- [x] **`stopChannels` had the same defect on disconnect.**
      The pre-cleanup path filtered on `webhook_resource_id` and hardcoded
      `subscriptionId: null`, so disconnecting a Microsoft account could leave
      its subscriptions live until they expired. Disconnect now uses the
      shared provider-neutral registration reconstruction.
- [x] **Dropping an imported calendar had the same teardown defect.**
      `integrations-import/index.ts` also filtered only on
      `webhook_resource_id` and passed `subscriptionId: null`; a Microsoft
      calendar dropped from the picker could therefore leave its Graph
      subscription live. Its teardown now uses the same shared registration
      reconstruction as renewal and disconnect.
- [x] **Google-named error codes on provider-agnostic paths.**
      The former Google-specific auth and cursor codes were thrown and
      compared in `providers/accounts.ts`, `sync/engine.ts`, and
      `sync/worker.ts` — none of which know which provider they are serving.
      The shared definitions and Google adapter mappings now use
      `PROVIDER_AUTH_EXPIRED` and `PROVIDER_SYNC_CURSOR_INVALID`; ship the
      backend and client together without compatibility aliases. The mobile
      call-site documentation was updated as well.
- [x] **The mobile connect flow is provider-shaped but not yet Microsoft-enabled.**
      The API, hook, screen, connection card, and Settings contracts now use
      provider metadata while keeping the current Google flow working.
      Microsoft remains disabled until `oauth-microsoft-start`, its callback,
      and the registry entry exist; enabling that UI is a separate slice.
- [x] **Manual “Sync now” was not scoped to the account being refreshed.**
      A connection card passed its account id to the handler, but the hook/API
      omitted it, so `sync-run` queued every connected account while only one
      card showed a spinner. The mobile request now carries the provider-neutral
      `providerAccountId`, and `sync-run` filters imported calendars by that
      account before enqueueing jobs.

## Implementation checklist

- [x] Clear the toolchain and live Google backend/provider gates above. Azure
      remains a prerequisite only for live Microsoft OAuth/subscription
      verification.
- [x] Fix and review the six seam defects as one slice. Shared Google behavior
      was regression-checked by Deno, mobile, and static verification; no new
      live Google run occurred.
- [x] Microsoft config module: endpoints, scopes, client id/secret accessors,
      redirect URI — mirroring `providers/google/config.ts`.
- [x] `providers/microsoft/auth.ts` implementing `ProviderAuth`: authorisation
      URL, code exchange with PKCE, refresh, `identify` via `/me`, revoke.
      Microsoft revoke is a documented no-op: `revokeSignInSessions` is
      overbroad and unsupported for personal accounts, so deleting the Vault
      secret remains authoritative.
- [x] `providers/microsoft/client.ts`: authenticated fetch, Graph error
      mapping (including context-sensitive 410 cursor handling and 429/5xx
      retries honouring `Retry-After`).
- [x] **Prerequisite: extend `@cal/domain` recurrence parsing and expansion for
      Graph-required ordinal `BYDAY`, `BYMONTH`, `WKST`, and local date-only
      `UNTIL` semantics.** The XHigh audit found that without these cases,
      valid Outlook series can be silently treated as one-off events. The
      Graph structured-recurrence converter remains a separate pending slice.
- [ ] `providers/microsoft/schemas.ts` + `normalise.ts` (+ tests) translating
      Graph's event shape into `NormalisedEvent`.
- [ ] `providers/microsoft/provider.ts` implementing `CalendarProvider`.
- [ ] Register both in `providers/registry.ts`. **This should be the only
      edit above the adapter directory.**
- [ ] Edge Functions `oauth-microsoft-start`, `oauth-microsoft-callback`,
      `webhook-microsoft`.
- [x] Mobile: parameterise connect by provider kind while Microsoft endpoints
      are still unavailable; keep Microsoft UI disabled.
- [ ] Enable the Microsoft connect action and two-provider Integrations screen
      after the Microsoft OAuth endpoints and registry entry exist.
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
| Channel life    | ~1 month max, we ask for 7 days          | under 7 days for calendars — renewal remains high priority |
| Channel secret  | `token` echoed in a header               | `clientState` echoed in the body                          |
| Webhook setup   | No handshake beyond a `sync` state       | Must echo `validationToken` as plain text within 10s      |
| Identity        | OpenID `userinfo`                        | `/me` (`id`, `mail` or `userPrincipalName`)               |

Two consequences worth deciding early:

1. **Recurrence is the real work.** `NormalisedEvent.recurrenceRule` is a
   single RRULE line. Graph neither accepts nor emits one, so the adapter owns
   a bidirectional translation between RRULE and Graph's `recurrence` object.
   This is the most likely source of correctness bugs in the sprint and
   deserves unit tests before it is wired to anything.
2. **Sub-seven-day subscriptions change the risk profile.** A missed renewal is
   a silently stale calendar within days rather than weeks, so renewal remains
   high priority. The hourly renewal cron already exists, but Graph's
   account-scoped subscription must be reconciled once per account rather than
   once per imported calendar.

## Acceptance criteria

Sprint 4's eight criteria, restated for Microsoft, plus:

9. A user can connect both a Google and a Microsoft account at once, and each
   calendar syncs and writes independently of the other.
10. Adding Microsoft required no change to `sync/worker.ts`, `sync/jobs.ts`,
    `sync/upsert.ts`, or `sync/push.ts` beyond the shared defect fixes above.

## Verification log

### Inherited Sprint 4 evidence — 2026-09-01

- Local toolchain and dependencies are present; the second-machine verification
  passed formatting, lint, six workspace typechecks, 129 unit tests, Deno
  checks/tests, local migrations, and 20 database/RLS tests. The current
  machine uses pnpm 11.24.0 despite the repository's pnpm 9.12.0 pin.
- The live Google run verified OAuth start/callback, Vault token storage,
  calendar listing/import, an initial sync of 231 events, valid-cursor
  incremental sync, and provider-first create/update/delete through
  `provider-event-write`.
- The reviewed seam slice includes provider-aware watch-state reconstruction
  for renewal, disconnect, and calendar-drop teardown, plus the account-scoped
  manual Sync now filter. The watch helper has five focused tests.
- The full Deno test suite passed with 20 tests. The post-foundation full
  `deno task check` was deferred during concurrent watch-scope edits and will
  be rerun after that slice.
- Direct mobile TypeScript checking, targeted ESLint/Prettier checks, and
  `git diff --check` passed.
- Microsoft UI remains disabled until its OAuth and registry endpoints exist;
  this is intentional and does not block the next locally testable foundation.
- The recurrence-domain prerequisite is complete: 57 focused recurrence tests
  and 146 full `@cal/domain` tests pass, along with the domain TypeScript check,
  targeted ESLint/Prettier checks, and `git diff --check`. The Graph RRULE ↔
  structured-recurrence converter remains a separate pending component.
- The Graph watch-scope audit verified that Outlook `/me/events` subscriptions
  are mailbox/account scoped and duplicate subscriptions for the same resource
  and change type are rejected; the account-level storage, capability, and
  reconciliation webhook prerequisite remains in progress.
- The Microsoft config foundation is complete: provider-neutral PKCE/random
  helpers were extracted without changing Google behavior; tenant-safe v2
  authority, authorize, and token endpoints, Graph v1 base, exact delegated
  scopes, and redirect defaults were added; and server-only Microsoft env
  placeholders were recorded in `.env.example`.
- Five focused Microsoft config tests passed, covering tenant validation,
  endpoint construction, exact scopes, Graph v1, and redirect-default
  construction. Targeted Deno checks, Prettier, and `git diff --check` passed.
- The Microsoft auth adapter is complete: 12 focused tests cover exact PKCE
  authorization parameters, token exchange/refresh rotation, invalid grants,
  malformed responses, Graph identity fallback, status classification, and
  the documented revoke no-op.
- The Microsoft Graph client is complete: 12 focused tests cover authenticated
  JSON/no-content requests, malformed bodies, injected transport retries,
  deterministic seconds/date `Retry-After` handling with a cap, replay-safe
  retry opt-in, safe status mapping, and context-sensitive 410 behavior. Full
  Deno tests now pass 54/54; `deno task check`, targeted lint/format, and
  `git diff --check` pass.

### Still unverified

- iOS app-side OAuth/deep-link return from Settings, and the provider-owned
  event editor flow on the device.
- Real Google webhook delivery and replay/idempotency. Local Google push needs
  a public HTTPS tunnel or deployed project.
- A deliberate expired-cursor/HTTP 410 recovery run and a revoked-credential
  re-auth run.

These gaps do not block local Microsoft implementation. Azure registration is
needed only when live Microsoft OAuth and subscription delivery are ready to
verify.
