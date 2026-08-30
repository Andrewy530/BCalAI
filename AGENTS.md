# Engineering Rules

These rules apply to both developers and to any AI coding tool working in this
repository. They exist because the biggest risk on a two-person, AI-assisted
project is not speed — it is architecture drift.

Read `docs/architecture.md` before making a structural change.

## Non-negotiable

- TypeScript strict mode. No `any`, no `@ts-expect-error` without a comment
  saying what will remove it.
- **Never place business logic inside Expo Router route files** (`apps/mobile/app/**`).
  A route reads params, calls a feature hook, composes feature components, and
  triggers navigation. Nothing else. ESLint enforces the Supabase part of this.
- **Never call a provider API or Supabase directly from a React component.**
  Go through `features/<feature>/api/*` and a hook.
- **All schema changes are migrations.** Never edit a table by hand in Studio
  and never edit a migration that has been merged.
- **RLS is mandatory** on every user-owned table, with explicit policies for
  select / insert / update / delete. If a table should be server-only, enable
  RLS and write no policies.
- **Never expose the service-role key or a provider refresh token to the app.**
  Anything named `EXPO_PUBLIC_*` ships in the bundle and is public.
- **Calendar conflict calculation is deterministic code, not LLM reasoning.**
  See `packages/domain/src/scheduling/availability.ts`.
- **Validate every external input with Zod** — user input, provider payloads,
  webhook bodies, and model output alike.
- **AI output must be validated before it changes user data.** The model ranks
  and explains slots the engine produced; it never invents a time.

## Structure

- Feature-first. New code goes in `src/features/<feature>/`, not in a global
  `utils` or `components` folder.
- Pure domain logic goes in `packages/domain` and must not import React,
  React Native, Expo, or Supabase. ESLint enforces this.
- Reuse the primitives in `@cal/ui`. If you are writing a one-off style for
  something that looks like a Button, Card, or ListRow, stop and use the
  primitive — or extend it once, for everyone.
- One clear responsibility per file. A file over ~250–350 lines is a prompt to
  ask whether it is doing two things, not an automatic refactor.
- Do not add a dependency the existing stack can handle cleanly.

## Data

- Server state belongs to TanStack Query. UI-only state belongs to Zustand.
  Never mirror database rows into a Zustand store.
- Every query key comes from `queryKeys` in `src/lib/query/query-client.ts`.
- Snake_case ends at the API module. Everything above it is camelCase.
- Timestamps are stored and transported as UTC ISO strings. Convert to local
  wall-clock time only through `@cal/domain`'s timezone helpers.

## Sync

- The provider owns provider events; this database holds a normalised copy.
- Write to the provider first, then update the local copy.
- Webhooks are hints, not truth. Everything must also converge via periodic
  reconciliation.
- Every provider upsert must be idempotent and keyed on
  `(provider_account_id, provider_event_id)`.

## Pull requests

Every PR: one coherent problem, type-checks, lints, tests pass, screenshots or
video for UI changes, a migration when the database contract changed, and no
unrelated refactors.

Run before pushing:

```bash
pnpm verify
```
