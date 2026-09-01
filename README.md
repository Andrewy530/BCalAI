# Calendar + Reminders App

A premium personal planning app: calendar, reminders, tasks, and AI-assisted
time blocking. iOS-first, cross-platform-ready.

The full product and technical plan is in
[`calendar_app_product_technical_plan.md`](calendar_app_product_technical_plan.md).
Architecture decisions live in [`docs/`](docs/). Coding rules are in
[`AGENTS.md`](AGENTS.md) — read that first.

---

## Status

**Sprint 4 — Google Calendar implemented.** Sprints 0 through 4 are written.
On top of the internal calendar, Today dashboard, and search, a Google account
can now be connected from Settings, its calendars imported individually, and its
events synced in both directions — initial sync, incremental sync via
`nextSyncToken`, push-notification channels with hourly renewal, daily
reconciliation, and provider-first writes.

The monorepo checks, Edge Function checks/tests, local migrations, and database
tests now pass. The real Google OAuth round trip, webhook delivery, and
provider-first write flow still need device-level verification.

| Area                                                                          | State                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Monorepo, TypeScript strict, ESLint, Prettier, CI                             | Done                                               |
| Design tokens + UI primitives (`@cal/ui`)                                     | Done                                               |
| Database schema, RLS, pgTAP tests                                             | Done                                               |
| Auth (email, Apple), session, account deletion                                | Done                                               |
| Deterministic availability engine (`@cal/domain`)                             | Done, unit-tested                                  |
| Task inbox, editor, completion, snooze, delete                                | Done — Sprint 1                                    |
| Quick Add (task lane)                                                         | Done — Sprint 1                                    |
| Local task reminders + notification actions                                   | Done — Sprint 1                                    |
| Calendar views, event CRUD, recurrence, alerts, calendar colors               | Done — Sprint 2                                    |
| Today dashboard, merged timeline, overdue/unscheduled work, free-time summary | Done — Sprint 3                                    |
| Search across event/task titles, notes, and locations                         | Done — Sprint 3                                    |
| Settings planning preferences                                                 | Done — Sprint 3                                    |
| Google OAuth, calendar import, two-way sync, webhooks, retry                  | Done — Sprint 4; webhook delivery untested locally |
| Microsoft / Outlook sync                                                      | Implementation complete; live verification pending |
| AI Find Time, RevenueCat                                                      | Not started — Sprint 6                             |

The live implementation handoffs are [`docs/sprint-4-active.md`](docs/sprint-4-active.md)
and [`docs/sprint-5-active.md`](docs/sprint-5-active.md).

---

## Prerequisites

| Tool           | Version | Install                                                      |
| -------------- | ------- | ------------------------------------------------------------ |
| Node.js        | 20.18+  | https://nodejs.org (or `nvm install 20`)                     |
| pnpm           | 9+      | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| Docker Desktop | latest  | Required by the local Supabase stack                         |
| Supabase CLI   | 1.200+  | `brew install supabase/tap/supabase`                         |
| Xcode          | 16+     | Mac App Store, for the iOS build                             |
| Watchman       | latest  | `brew install watchman` (optional, faster reloads)           |

## First-time setup

```bash
corepack enable && pnpm install
```

```bash
supabase start
```

`supabase start` prints an API URL and an anon key. Copy the public mobile env
template and paste them in:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Keep server-only secrets (Google OAuth, service role, webhook, and cron
secrets) in `supabase/.env`; never put them in the mobile env file.

Apply the schema and the development seed data:

```bash
pnpm db:reset
```

Generate database types from the live local schema:

```bash
pnpm db:types
```

## Running the app

This project uses an **Expo development build**, not Expo Go — it depends on
native modules (Apple sign-in, notifications, secure storage) that Expo Go
cannot load. There is currently no hosted demo or TestFlight build in the
repository. The first real preview is a local iOS simulator or device.

Build the dev client once per Mac:

```bash
pnpm --filter @cal/mobile exec expo run:ios
```

That generates the native iOS project and installs the development build. After
that, day to day:

```bash
pnpm mobile
```

Sign in with the seeded account: `dev@example.com` / `password123`.

## Checks

```bash
pnpm verify
```

Runs format check, lint, typecheck, and unit tests — the same set CI runs.
Database tests need the local stack running:

```bash
supabase test db
```

## Layout

```
apps/mobile/        Expo app. app/ is routes only; src/ holds features.
packages/ui/        Design system: tokens, primitives, ThemeProvider.
packages/domain/    Pure logic: time, availability engine, layout, grouping.
packages/schemas/   Zod schemas — the single source of truth for shapes.
packages/types/     Generated database types and shared result/error types.
supabase/           Migrations, RLS tests, seed, Edge Functions.
docs/               Architecture, database, sync engine, AI scheduling, ADRs.
```

## Troubleshooting

**Metro cannot resolve `@cal/ui`** — pnpm symlinks confuse a stale cache.
`pnpm --filter @cal/mobile exec expo start --clear`.

**Env var errors on launch** — `src/lib/env.ts` validates configuration at
startup and names what is missing. Check `apps/mobile/.env`.

**Dependency version warnings** — let Expo pick the versions that match the
SDK: `pnpm --filter @cal/mobile exec expo install --fix`.
