# Architecture

## The one rule that shapes everything

**The AI never decides whether a time is free.**

A deterministic engine computes availability from calendar data. The model
interprets intent, normalises preferences, ranks the slots the engine produced,
and explains its choice. That boundary is what makes the calendar trustworthy,
and it is enforced structurally: `packages/domain` cannot import a network
client, and the AI's output schema only permits references to slot ids the
engine already generated.

## Layers

```
Route (apps/mobile/app/**)        params, composition, navigation
        │
Feature screen                    layout and interaction
        │
Feature hook                      TanStack Query, mutations, side effects
        │
Feature API module                Supabase calls, snake_case ↔ camelCase
        │
Supabase                          Postgres + RLS, Edge Functions, Cron, Vault
        │
Provider adapters                 Google Calendar, Microsoft Graph
```

Each arrow is one-directional. A screen never reaches past its hook; an API
module never imports a component.

## Where state lives

| Kind          | Home                           | Example                                      |
| ------------- | ------------------------------ | -------------------------------------------- |
| Server state  | TanStack Query                 | events, tasks, profile, entitlement          |
| UI-only state | Zustand                        | current view mode, selected date, open sheet |
| Form state    | React Hook Form                | the event editor being filled in             |
| Session       | Supabase Auth + `AuthProvider` | who is signed in                             |

Database rows are never mirrored into Zustand. If two components need the same
row, they use the same query key.

## Package boundaries

- `@cal/schemas` — Zod schemas. The single source of truth for every shape.
  Domain types are _inferred_ from these, so runtime validation and compile-time
  types cannot drift apart.
- `@cal/domain` — pure functions: time-zone conversion, interval math, the
  availability engine, calendar layout, task bucketing. No React, no network,
  no platform APIs. This is where the unit tests are.
- `@cal/ui` — design tokens and primitives. Owns the theme so a future web or
  admin surface can adopt the same scale.
- `@cal/types` — generated database types plus the shared `Result`/`AppError`.

## Decision A — source of truth

| Data             | Authority                            |
| ---------------- | ------------------------------------ |
| Internal tasks   | This database                        |
| Internal events  | This database                        |
| Google events    | Google; we hold a normalised copy    |
| Microsoft events | Microsoft; we hold a normalised copy |

`events.source_type` records which case a row is in. A row whose source is a
provider is never edited locally without first writing to the provider.

## Decision B — two-way sync

Read sync ships first and is validated before writes are enabled. See
[`sync-engine.md`](sync-engine.md).

## Decision C — AI autonomy

Proposals require confirmation in the first paid release. Auto-scheduling is a
later opt-in with an undo history.

## Decision D — email scanning

A separate opt-in feature, after calendar integrations are stable. Gmail's
restricted scopes carry verification and security-assessment obligations that
should not gate launch.

## Security model

- The app holds only the anon key and operates as the signed-in user. RLS is
  what actually protects data — not client-side filtering.
- Provider refresh tokens live in Vault. `provider_accounts.secret_reference_id`
  holds a reference, and column privileges are revoked from client roles.
- `calendar_sync_states` has RLS enabled and no policies: service-role only.
- Entitlement is checked by `public.has_active_entitlement()` server-side. A
  client-supplied "is pro" flag is never trusted.
- Edge Functions wrap handlers in `withErrorHandling`, which guarantees an
  unexpected exception cannot leak a provider payload to the client.

## Observability

Errors carry stable codes (`ERROR_CODES` in `@cal/types`), so a code seen in the
app matches a code in the function logs and, later, in Sentry:

```
GOOGLE_AUTH_EXPIRED           MICROSOFT_SUBSCRIPTION_EXPIRED
GOOGLE_SYNC_CURSOR_INVALID    EVENT_PROVIDER_CONFLICT
AI_NO_VALID_SLOT              AI_RATE_LIMITED
SUBSCRIPTION_REQUIRED         NOTIFICATION_PERMISSION_DENIED
```

Never log event titles, task contents, or email bodies. Log codes, ids, counts,
and durations.

## Offline behaviour

Recently loaded calendar ranges and task lists stay cached; simple task actions
update optimistically. Sync failures are shown, never swallowed. A full
local-first replication engine is deliberately out of scope until the product is
validated.
