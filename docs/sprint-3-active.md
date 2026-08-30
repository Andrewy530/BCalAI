# Sprint 3 — Active implementation tracker

Status: **Implementation complete; device smoke test pending**
Last updated: **2026-08-30**

This is the live handoff for the current Sprint 3 implementation. Update the
checkboxes, file map, and verification notes as work lands. A different model
should be able to continue from this file plus `AGENTS.md` and
`docs/architecture.md` without reconstructing the sprint from chat history.

## Goal

Turn the Sprint 0 Today and Search shells into a useful daily planning surface,
make the existing planning preferences real, and add the small interaction
polish that makes the internal calendar and task inbox feel like one product.

## Scope

- Today dashboard with current/next event, merged event/task timeline, overdue
  tasks, due-today tasks, unscheduled flexible work, and a deterministic
  working-hours free-time summary.
- Search across internal events and tasks, including notes/descriptions and
  event locations.
- Functional planning preferences: time zone, week start, clock format,
  working hours, and default task duration.
- Loading, error, empty, retry, accessibility, and haptic/motion polish.
- No Google Calendar, Microsoft Calendar, AI scheduling, subscriptions,
  push notifications, widgets, or TestFlight work in this sprint.

## Implementation checklist

- [x] Audit current code, roadmap, architecture, and verification constraints.
- [x] Create this active tracker.
- [x] Add pure Today/free-time derivation and tests.
- [x] Wire Today to live task/event/profile data.
- [x] Render the merged timeline and actionable task sections.
- [x] Add combined event/task search and result actions.
- [x] Make planning preference rows functional.
- [x] Apply Sprint 3 motion, haptic, accessibility, and failure-state polish.
- [x] Run formatting, lint, typecheck, and unit tests; record exact results.
- [ ] Perform iOS simulator/device smoke verification when the local Expo and
      Supabase prerequisites are available.

## File map for the next model

### Today

- `apps/mobile/src/features/today/hooks/useTodaySummary.ts` — authenticated
  queries and derived Today data.
- `apps/mobile/src/features/today/components/TodayTimeline.tsx` — one
  chronological event/task list with task completion and edit actions.
- `apps/mobile/src/features/today/screens/TodayScreen.tsx` — screen composition
  only; it should not call Supabase directly.
- `packages/domain/src/calendar/today.ts` — pure free-time calculation.

### Search

- `apps/mobile/src/features/search/api/search.api.ts` — Supabase reads and row
  validation through the existing feature API modules.
- `apps/mobile/src/features/search/hooks/useSearch.ts` — cached combined query.
- `apps/mobile/src/features/search/screens/SearchScreen.tsx` — query input,
  state handling, and result actions.

### Settings

- `apps/mobile/src/features/settings/components/PlanningPreferencesSheet.tsx`
  — edits profile-backed planning preferences through `useUpdateProfile`.
- `apps/mobile/src/features/settings/screens/SettingsScreen.tsx` — launches
  the sheet and displays the saved values.

## Acceptance criteria

1. A signed-in user with seeded events/tasks sees real Today data; no data is
   hard-coded into the screen.
2. Events and timed tasks are ordered by instant, with event/task actions
   opening the existing editors and task checkboxes completing optimistically.
3. Overdue, due-today, and unscheduled sections use the same timezone-aware
   task bucketing rules as the Tasks screen.
4. Free time is calculated from the user's working hours minus today's event
   intervals, never by guessing in the UI.
5. Search returns matching events and tasks and opens the correct editor.
6. Every planning row in Settings has a working save path or a clearly
   supported native picker; no `onPress={() => undefined}` remains for Sprint 3
   preferences.
7. Empty, loading, error, and retry states remain intentional and accessible.
8. Verification results and any environment-only blockers are recorded below.

## Verification log

- Targeted Prettier check: passed for all changed and new Sprint 3 files.
- Mobile TypeScript check: passed with `tsc --noEmit -p apps/mobile/tsconfig.json`.
- Package TypeScript checks: passed for every `packages/*/tsconfig.json` project.
- Domain unit tests: passed — 11 files, 129 tests.
- Focused ESLint check: passed for the Sprint 3 files after the implementation
  fixes.
- `git diff --check`: passed.
- Repository handoff: Sprint 3 implementation was pushed to `origin/main` as
  commit `d3c8fdf`.
- Full `pnpm verify`: not usable with the available global pnpm 11 runtime; it
  attempted a non-interactive modules-directory reconciliation and stopped.
  The direct equivalent checks above passed. The repository-wide ESLint and
  Prettier checks also still report pre-existing issues in untouched files.
- Expo native/iOS smoke test: pending; `apps/mobile/ios` is not generated.

## Handoff prompt

> Read `AGENTS.md`, `docs/architecture.md`, and `docs/sprint-3-active.md`.
> Inspect the current files before editing. Continue only unchecked Sprint 3
> items, preserve unrelated working-tree changes, update this tracker after
> each completed slice, and run the smallest meaningful verification available.
> Do not start Sprint 4–7 work.
