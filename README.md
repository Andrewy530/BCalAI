# Calendar + Reminders App

A premium personal planning app: calendar, reminders, tasks, and AI-assisted
time blocking. iOS-first, cross-platform-ready.

The full product and technical plan is in
[`calendar_app_product_technical_plan.md`](calendar_app_product_technical_plan.md).
Architecture decisions live in [`docs/`](docs/). Coding rules are in
[`AGENTS.md`](AGENTS.md) — read that first.

---

## Current status

**Sprint 6 — AI Pro / Find Time: Phases 1–4 implemented and hardened (deterministic preparation, provider abstraction, proposal generation, and safe confirmation/revalidation); live model evaluation and Phase 5 RevenueCat remain pending.** Sprints 0 through 4 are
complete/implemented. Sprint 5's Microsoft
implementation is complete in code with external lifecycle/device verification
still tracked separately. The Phase 0 audit used
`4678adc381cd0e85326772a5e7d6864af9589a1c` on `main`.

Google live OAuth, calendar import, initial/incremental sync, and
provider-first create/update/delete were verified in Sprint 4. Microsoft OAuth,
calendar listing/import, and initial/incremental delta sync have live evidence;
real provider CRUD, webhook delivery/renewal/teardown, and device/deep-link
verification remain open in the Sprint 5 tracker.

The current source-of-truth handoff is
[`docs/sprint-6-active.md`](docs/sprint-6-active.md). The Sprint 3 and Sprint 4
trackers are closed historical records; the Sprint 5 tracker retains Microsoft
external-verification evidence.

| Area                                                                          | State                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Monorepo, TypeScript strict, ESLint, Prettier, CI                             | Implemented; verification is environment-dependent                     |
| Design tokens + UI primitives (`@cal/ui`)                                     | Done                                                                   |
| Database schema, RLS, pgTAP tests                                             | Done                                                                   |
| Auth (email, Apple), session, account deletion                                | Done                                                                   |
| Deterministic availability engine (`@cal/domain`)                             | Done, unit-tested                                                      |
| Task inbox, editor, completion, snooze, delete                                | Done — Sprint 1                                                        |
| Quick Add (task lane)                                                         | Done — Sprint 1                                                        |
| Local task reminders + notification actions                                   | Done — Sprint 1                                                        |
| Calendar views, event CRUD, recurrence, alerts, calendar colors               | Done — Sprint 2                                                        |
| Today dashboard, merged timeline, overdue/unscheduled work, free-time summary | Done — Sprint 3                                                        |
| Search across event/task titles, notes, and locations                         | Done — Sprint 3                                                        |
| Settings planning preferences                                                 | Done — Sprint 3                                                        |
| Google OAuth, calendar import, two-way sync, webhooks, retry                  | Done — Sprint 4; live major flows verified; webhook/device gaps remain |
| Microsoft / Outlook sync                                                      | Done in code — Sprint 5; live verification pending                     |
| AI Find Time, RevenueCat                                                      | Phases 1–4 done; live model eval and Phase 5 RevenueCat pending        |

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

Keep server-only secrets (service role, Google and Microsoft OAuth client
credentials, OAuth redirect settings, webhook URLs, and cron secrets) in the
Supabase/Edge Function secret store; never put them in the mobile env file.
Microsoft uses `MICROSOFT_OAUTH_CLIENT_ID`,
`MICROSOFT_OAUTH_CLIENT_SECRET`, optional `MICROSOFT_OAUTH_TENANT` and
`MICROSOFT_OAUTH_REDIRECT_URI`, plus `MICROSOFT_WEBHOOK_URL` when the public
callback URL is not derived from `SUPABASE_URL`. Azure must register the same
web redirect URI and delegated `Calendars.ReadWrite` access.

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

To run the desktop web client:

```bash
pnpm web
```

Sign in with the seeded account: `dev@example.com` / `password123`.

## Checks

```bash
pnpm verify
```

Runs format check, lint, typecheck, unit tests, and production web build — the same set CI runs.
Database tests need the local stack running:

```bash
supabase test db
```

Active tracks:

- Mobile Sprint 6 decisions and handoff: [`docs/sprint-6-active.md`](docs/sprint-6-active.md).
- Web application architecture and roadmap: [`docs/web-active.md`](docs/web-active.md).
- Historical Sprint 5 verification evidence: [`docs/sprint-5-active.md`](docs/sprint-5-active.md).

## Layout

```
apps/mobile/        Expo iOS/Android app. app/ is routes only; src/ holds features.
apps/web/           Desktop React web client. Vite + React Router + plain CSS.
packages/ui/        Mobile design system: tokens, primitives, ThemeProvider.
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
