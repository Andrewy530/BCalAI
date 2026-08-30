# Calendar + Reminders App

A premium personal planning app: calendar, reminders, tasks, and AI-assisted
time blocking. iOS-first, cross-platform-ready.

The full product and technical plan is in
[`calendar_app_product_technical_plan.md`](calendar_app_product_technical_plan.md).
Architecture decisions live in [`docs/`](docs/). Coding rules are in
[`AGENTS.md`](AGENTS.md) — read that first.

---

## Status

**Sprint 0 — engineering foundation.** The workspace, design system, database
schema with RLS, auth, and the app shell exist. The tab screens render polished
empty states; the features behind them land in Sprints 1–6.

| Area | State |
| --- | --- |
| Monorepo, TypeScript strict, ESLint, Prettier, CI | Done |
| Design tokens + UI primitives (`@cal/ui`) | Done |
| Database schema, RLS, pgTAP tests | Done |
| Auth (email, Apple), session, account deletion | Done |
| Deterministic availability engine (`@cal/domain`) | Done, unit-tested |
| Tasks, calendar views, Today, search | Shells only — Sprints 1–3 |
| Google / Microsoft sync | Sprints 4–5 |
| AI Find Time, RevenueCat | Sprint 6 |

---

## Prerequisites

| Tool | Version | Install |
| --- | --- | --- |
| Node.js | 20.18+ | https://nodejs.org (or `nvm install 20`) |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| Docker Desktop | latest | Required by the local Supabase stack |
| Supabase CLI | 1.200+ | `brew install supabase/tap/supabase` |
| Xcode | 16+ | Mac App Store, for the iOS build |
| Watchman | latest | `brew install watchman` (optional, faster reloads) |

## First-time setup

```bash
corepack enable && pnpm install
```

```bash
supabase start
```

`supabase start` prints an API URL and an anon key. Copy the example env file
and paste them in:

```bash
cp .env.example .env
```

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
cannot load. Build the dev client once per machine:

```bash
pnpm --filter @cal/mobile exec expo run:ios
```

After that, day to day:

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
startup and names what is missing. Check `.env` at the repo root.

**Dependency version warnings** — let Expo pick the versions that match the
SDK: `pnpm --filter @cal/mobile exec expo install --fix`.
