# Sprint 5 — Active implementation tracker

Status: **IMPLEMENTATION COMPLETE / EXTERNAL VERIFICATION REMAINING**
Last updated: **2026-08-31**

Prior implementation checkpoint: **`1e2361910b1ae83dcc9441a45204722a1ddf79fa`**

This continuation is working from the checkpoint above. The current `HEAD` is
that commit on `main`; the worktree was clean before this tracker update. The
checkpoint is preserved as the baseline—working Sprint 5 code is being extended,
not replaced.

## Checkpoint reconciliation — 2026-08-31

Source-level audit of the current tree confirms:

- **Completed in the checkpoint:** provider-neutral error and mobile connection
  plumbing; Microsoft tenant/config, PKCE auth, token handling, identity lookup,
  and Graph transport foundations; provider-neutral watch reconstruction;
  account-watch and account-serialized queue migrations; recurrence parsing and
  expansion extensions; Google/shared call-site updates.
- **Partially completed:** account-scoped watch support exists in the contract,
  storage, engine, cron, and teardown helpers, but the Microsoft adapter and
  webhook still had to be added; recurrence support had the domain RRULE
  prerequisite but no Graph structured-recurrence translation.
- **Unimplemented at the checkpoint:** Microsoft Graph schemas beyond auth
  payloads, event normalization, provider adapter, registry registration,
  Microsoft OAuth Edge Functions, Microsoft webhook, and enabled Microsoft UI.
- **Verified evidence carried by the checkpoint:** its tracker records Google
  live sync/write evidence, focused Microsoft auth/client/config tests, the
  recurrence/domain tests, Deno checks/tests, mobile checks, and database/RLS
  checks. Those results are inherited evidence, not a verification run in this
  continuation; each relevant check will be rerun after changes.
- **Not yet verified in this continuation:** the shared watch/queue audit,
  Microsoft adapter/webhook behavior, final Deno/database checks, and any live
  Microsoft flow. Node/mobile/domain checks are being rerun as slices land.
- **External/manual blockers:** Azure app registration and credentials are
  required for real Microsoft OAuth and Graph subscription delivery; a public
  HTTPS endpoint and a device/deep-link build are required for end-to-end
  webhook/mobile verification. No success will be claimed without them.

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

- [x] **A working project toolchain baseline (inherited evidence).** A prior
      machine passed formatting, lint, workspace typechecks, unit tests, Deno,
      migrations, and database/RLS checks. This Windows host has since restored
      the Node workspace dependencies, but does not have `deno`, `supabase`, or
      Docker in PATH; local results below are separated by host/toolchain.
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

## Graph watch-scope prerequisite — completed in this continuation

- [x] **Account-scoped registration is represented end to end.** Outlook
      `/me/events` subscriptions use the account watch capability, server-only
      provider-account watch fields, account reconciliation jobs, and the
      provider-neutral renewal seam. Dropping one imported calendar removes
      only that calendar's local sync state; disconnect teardown removes the
      account subscription through the server path.

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

## Shared infrastructure audit — continuation slice 1

- [x] **Disconnect teardown is now server-only.** `provider_accounts` no longer
      grants the authenticated role DELETE access. The new migration
      `20260901000011_secure_provider_account_disconnect.sql` drops the direct
      delete policy and revokes table DELETE; `integrations-disconnect` remains
      the path that stops watches and removes the Vault credential first.
- [x] **Queued calendar jobs are account-scoped at dispatch.** `worker.ts` now
      verifies the loaded sync state belongs to the claimed provider account
      before syncing or renewing it. A malformed/replayed JSON payload cannot
      make one connection operate on another connection's calendar.
- [x] **Provider-owned writes are account-scoped.** `push.ts` now requires the
      event and writable calendar rows to belong to the claimed provider account
      as well as the user, closing the same queue/account mismatch for update,
      delete, and create.
- [x] **Successful sync responses own the persisted cursor.** `engine.ts` now
      stores `result.cursor` exactly and fails the job if the state write fails;
      it no longer preserves a stale cursor when a provider returns null.
- [ ] **Still requires runtime verification.** The checks below need to be rerun
      with the local Deno/Supabase toolchain; this machine currently has no
      `deno` or `supabase` executable in PATH.

Design conclusion: Google remains on its calendar-scoped watch path, while the
shared worker/queue/write paths stay provider-neutral. The audit found no reason
to add a provider branch above the registry; the concrete fixes above are
security/integrity checks that apply equally to Google and Microsoft.

## Implementation checklist

- [x] Clear the toolchain and live Google backend/provider gates above. Azure
      remains a prerequisite only for live Microsoft OAuth/subscription
      verification.
- [x] Fix and review the six seam defects as one slice. Shared Google behavior
      was regression-checked by Deno, mobile, and static verification; no new
      live Google run occurred.
- [x] Apply the continuation shared-safety audit: server-only provider-account
      disconnect, account-scoped queued state/write checks, exact cursor
      persistence, claim fencing for recovered jobs, and the tracked pnpm-store
      hygiene fix. Runtime checks remain pending on this machine.
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
      Graph structured-recurrence converter and focused translation tests are
      now complete below the provider boundary.
- [x] `providers/microsoft/schemas.ts` + `normalise.ts` (+ focused tests)
      translate validated Graph calendars, timed/all-day events, tombstones,
      cancellations, recurrence identity, time zones, descriptions, alerts,
      and provider version metadata into `NormalisedEvent`.
- [x] `providers/microsoft/recurrence.ts` (+ focused tests) translates the
      supported daily/weekly/monthly/yearly Graph patterns and ranges in both
      directions. Unsupported RRULE selectors, instant UNTIL values, and
      nonrepresentable relative forms are rejected explicitly.
- [x] `providers/microsoft/provider.ts` (+ focused tests) implements calendar
      pagination, fixed-window `calendarView/delta`, opaque cursor pagination,
      normalized deletions, provider-first event writes, account watches,
      in-place subscription renewal, and teardown.
- [x] Register both in `providers/registry.ts`. **This remains the only
      provider-resolution edit above the adapter directory.**
- [x] Edge Functions `oauth-microsoft-start`, `oauth-microsoft-callback`,
      `webhook-microsoft` are implemented with server-only token handling,
      validation-token acknowledgement, clientState checks, and queue-only
      notification handling. Focused runtime tests remain unrun on this host.
- [x] Mobile: parameterise connect by provider kind; the shared UI remains
      provider-neutral and Microsoft is enabled only after the backend path was
      added.
- [x] Enable the Microsoft connect action and two-provider Integrations screen;
      the callback result now also has to identify the requested provider.
- [ ] Full verification pass: `pnpm verify`, Deno check and tests, database
      tests, and a real OAuth round trip against Microsoft.

## Where Graph differs from Google

The differences that actually shape the adapter, so they are not rediscovered
mid-implementation:

| Concern         | Google                                   | Microsoft Graph                                            |
| --------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Incremental     | `syncToken` on `events.list`             | `/calendarView/delta` with a `deltaLink`                   |
| Expired cursor  | HTTP 410                                 | HTTP 410 `syncStateNotFound`                               |
| Window          | `timeMin`/`timeMax`, fixed at first sync | `startDateTime`/`endDateTime` on the delta series          |
| Recurrence      | Master + modified occurrences            | `seriesMaster` + `exception`/`occurrence` types            |
| Recurrence rule | RFC 5545 `RRULE` string                  | A structured `recurrence` object translated by the adapter |
| Deletions       | Tombstone with `status: cancelled`       | `@removed` annotation on the delta entry                   |
| Channel life    | ~1 month max, we ask for 7 days          | under 7 days for calendars — renewal remains high priority |
| Channel secret  | `token` echoed in a header               | `clientState` echoed in the body                           |
| Webhook setup   | No handshake beyond a `sync` state       | Must echo `validationToken` as plain text within 10s       |
| Identity        | OpenID `userinfo`                        | `/me` (`id`, `mail` or `userPrincipalName`)                |

Two consequences worth deciding early:

1. **Recurrence remains the correctness boundary.** `NormalisedEvent` keeps a
   single RRULE line, while Graph uses a structured object. The adapter now
   translates the supported subset in both directions and rejects selectors it
   cannot represent. Delta rows also retain recurring-instance identity so the
   client can apply moved/cancelled occurrences without duplicating a series.
2. **Sub-seven-day subscriptions change the risk profile.** A missed renewal is
   a silently stale calendar within days rather than weeks, so renewal remains
   high priority. The hourly renewal cron already exists, but Graph's
   account-scoped subscription must be reconciled once per account rather than
   once per imported calendar.

## Acceptance criteria

Sprint 4's eight criteria, restated for Microsoft, plus:

9. A user can connect both a Google and a Microsoft account at once, and each
   calendar syncs and writes independently of the other.
10. Adding Microsoft required no provider-specific branch in the shared worker,
    queue, upsert, or push path. The shared changes are limited to provider-
    neutral safety, recurrence-instance metadata, and conditional versioning.

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
- Microsoft UI was disabled in this historical snapshot; continuation slice 3
  enabled it after the OAuth, webhook, and registry paths were added.
- The recurrence-domain prerequisite is complete: 57 focused recurrence tests
  and 146 full `@cal/domain` tests pass, along with the domain TypeScript check,
  targeted ESLint/Prettier checks, and `git diff --check`. The Graph RRULE ↔
  structured-recurrence converter is now implemented in the Microsoft adapter;
  this inherited note predates that continuation slice.
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

### Continuation implementation log — 2026-08-31

- Slice 2 landed Graph schemas, event normalization, bidirectional recurrence
  translation, the Microsoft `CalendarProvider`, registry registration, and a
  stricter Graph 410 classifier. Focused tests were added but have not run on
  this machine yet because Deno is not installed/in PATH; formatting was run
  with the repository-local Prettier binary.
- Graph delta stores the complete validated `@odata.deltaLink` and follows
  complete `@odata.nextLink` URLs only after same-origin Graph validation. The
  provider uses v1.0 `calendarView/delta` with the shared fixed initial window;
  it does not use beta unbounded event delta.
- Graph renewal uses PATCH on the existing subscription. The shared engine now
  uses the provider-neutral optional renewal seam, falling back to
  stop-and-create only when a provider lacks in-place renewal or Graph returns
  that the old subscription is gone. This avoids duplicate live Graph
  subscriptions during ordinary hourly renewal.
- Remaining risk in this slice: `calendarView/delta` can return recurring
  occurrences/exceptions rather than a series master. The normalized model can
  represent masters and modified occurrences, but the client-side occurrence
  deduplication/reconciliation behavior still needs a deliberate verification
  pass before calling recurrence E2E complete.

### Continuation implementation log — 2026-08-31, slice 3

- Microsoft OAuth start/callback and `webhook-microsoft` are now present and
  configured as unauthenticated redirect/webhook functions. The callback
  consumes single-use state before code exchange, requires a refresh token,
  stores it through the existing Vault RPC, updates the natural-key account on
  reconnect, and returns only fixed provider/status values to the app.
- The Microsoft webhook returns the URL-decoded validation token as plain text,
  validates the stored subscription id and constant-time clientState, dedupes
  account jobs, and enqueues account reconciliation plus lifecycle renewal;
  it never calls Graph or drains the queue inline.
- Microsoft is enabled in provider metadata. The shared Integrations screen,
  calendar picker, account-scoped Sync now, reconnect, and disconnect paths are
  reused for both providers; the mobile callback rejects a result for a
  different provider than the one it started.
- Focused webhook and Microsoft-provider runtime checks are still pending
  because Deno is not installed/in PATH. Mobile workspace links are now present;
  direct mobile typechecking has passed on this host.
- Remaining correctness risk is unchanged: Graph `calendarView/delta` may
  return occurrences/exceptions alongside masters, while the current database
  stores one RRULE master plus provider recurrence-instance metadata. The client
  expansion helper applies moved/cancelled instances, but Deno/database runtime
  verification is still required before recurrence E2E is marked complete.

### Continuation implementation log — 2026-08-31, slice 4

- Recurrence-instance metadata is now provider-neutral: the migration adds
  `recurring_event_id` and `recurrence_original_start_at`; Google and Microsoft
  normalizers populate it; upsert preserves cancelled recurring instances as
  suppression rows; and the mobile calendar expansion applies exceptions and
  materialized Microsoft occurrences without changing the shared sync engine's
  provider boundary.
- Provider-owned updates now carry the stored provider ETag through the shared
  write input. Microsoft sends `If-Match` on PATCH, so a stale edit becomes the
  existing provider-conflict error instead of silently overwriting a newer
  Outlook change; Google ignores the optional field.
- Added focused cancelled-occurrence/body-preference/ETag assertions. Direct
  domain, schemas, and mobile typechecks plus targeted lint/format remain the
  local verification path; Deno, migration, RLS, and webhook runtime checks
  remain unavailable on this host.
- Remaining risk: Graph can omit recurrence identity on some deletion
  tombstones, in which case the provider correctly removes only the known row;
  live recurrence behavior and subscription lifecycle still need runtime and
  external verification.

### Continuation implementation log — 2026-08-31, slice 5

- Added `sync_jobs.claim_token` and a migration that fences completion by the
  token returned from `claim_sync_jobs`. Reclaimed leases remain retryable, but
  an old worker can no longer complete a newer attempt; client roles cannot read
  the token. The queue regression test now covers independent-account claims,
  one-job-per-account, stale recovery, and old-token rejection.
- Updated the worker/RPC/type handoff and database documentation. The SQL test
  remains unrun here because the Supabase CLI/Docker stack is unavailable.

### Continuation implementation log — 2026-08-31, slice 6

- The client recurrence expansion now treats a cancelled exception as a
  suppression marker rather than drawable content. Added a focused utility test
  covering moved/cancelled Google exceptions and materialized Microsoft
  occurrences without master duplication.
- Local result: the utility test passed 2/2 and targeted mobile/schema lint plus
  mobile typechecking passed. Deno provider/webhook tests and database tests
  remain external to this host's installed toolchain.

### Continuation implementation log — 2026-08-31, slice 7

- Fixed the Microsoft lifecycle batch ordering case: a regular notification no
  longer suppresses the renewal job later in the same batch. The OAuth callback
  now rejects malformed or already-expired stored state timestamps, and the
  empty Integrations screen exposes the second available provider action.
- Scoped mobile recurrence relationships by local calendar id as well as opaque
  provider series id, preventing simultaneous Google and Microsoft accounts
  from cross-overriding a series. Added a focused collision regression.
- Audited Graph time-zone precedence: recurring masters now use the structured
  recurrence time zone before response `start/end` zones, preserving local
  RRULE expansion when Graph returns event times in UTC. The claim-fencing
  migration now grants the queue's explicit safe projection instead of relying
  on a column-level revoke, and renewal recreates a watch when its stored
  clientState is missing.
- The official Graph lifecycle contract confirms that PATCHing an existing
  subscription with a new expiry both reauthorizes and renews it; a
  `subscriptionRemoved` notification requires creating a replacement and then
  reconciling missed changes. The existing provider-neutral renewal job covers
  that behavior, so no extra lifecycle branch was added.
- Local mobile/typecheck/ESLint checks passed after the mobile change. The
  Microsoft adapter/webhook Deno tests and SQL tests remain unrun because this
  host has no Deno, Supabase CLI, or Docker.

These gaps do not block local Microsoft implementation. Azure registration is
needed only when live Microsoft OAuth and subscription delivery are ready to
verify.

## Final continuation verification — 2026-08-31

- [x] Direct TypeScript checks passed for `packages/domain`,
      `packages/schemas`, `packages/types`, and `apps/mobile` with the repository
      TypeScript binary (`tsc --noEmit`).
- [x] `packages/domain` Vitest passed: 11 test files, 146 tests.
- [x] Focused mobile recurrence expansion Vitest passed: 1 test file, 3 tests.
- [x] Repository ESLint passed with `node node_modules/eslint/bin/eslint.js .`.
- [x] Explicit Prettier check passed for the changed Markdown, YAML, TS, and
      TSX files. `supabase/config.toml` was excluded because the installed
      Prettier reports that it cannot infer a TOML parser.
- [x] `git diff --check` passed. The tracked `.pnpm-store/v11/index.db` was
      removed from the index and `.gitignore` now excludes `.pnpm-store/`.
- [ ] Root `pnpm verify` did not reach its format/lint/typecheck/test scripts:
      pnpm 11 repeatedly recreated the workspace dependency tree during its
      package-manager install step and was stopped. This is an environment/tooling
      limitation, not a reported source-test failure.
- [ ] `deno task check` and Microsoft Deno tests could not run because Deno is
      not installed or on PATH.
- [ ] Supabase migration/RLS checks could not run because the Supabase CLI and
      Docker are not installed or on PATH.
- [ ] Microsoft live OAuth, Graph delta/CRUD, webhook delivery, renewal,
      teardown, and device/deep-link verification were not exercised; Azure
      configuration and a public HTTPS callback are not available on this host.

## Follow-up work (not Sprint 5 blockers)

- Supply the Azure app registration, tenant/client configuration, delegated
  scopes, redirect URI, and public HTTPS webhook deployment; run the complete
  Microsoft OAuth, calendar import, initial/delta sync, provider-first CRUD,
  Outlook-side change, webhook, lifecycle, renewal, teardown, and reauth flow.
- Install Deno, the Supabase CLI, and Docker, then run the Deno checks/tests,
  `supabase db reset`, `supabase test db`, and generated-type comparison.
- Expand the Microsoft Windows/IANA timezone alias table only if a required
  production timezone is outside the current fail-closed mapping.
- Verify real Graph tombstones for cancelled recurring instances. If a
  tombstone omits recurrence identity, the current safe behavior removes the
  known local row but cannot preserve a separate suppression marker.
- Re-run inherited Google device/deep-link, webhook, and revoked-credential
  checks. Google remains on its calendar-scoped watch path; no Google provider
  behavior was intentionally redesigned in this continuation.
- Do not implement nonblocking queue, revocation, or health-view improvements
  in this Sprint 5 continuation.
