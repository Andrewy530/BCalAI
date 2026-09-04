# Web Application — Active Implementation Tracker

Status: WEB PHASE 2 COMPLETED — READY FOR PUSH

This document is the single source of truth for web client implementation, architecture boundaries, and handoff.

---

## Architectural Principles & Invariants

1. **Parallel Execution with Mobile Sprint 6:**
   - Web development operates in parallel to mobile/iOS work.
   - Mobile and RevenueCat tracks continue independently and must not be disrupted.
2. **Strict UI Isolation:**
   - Web UI is isolated from mobile UI.
   - `apps/web` must NEVER import from `apps/mobile/**`, `react-native*`, `expo*`, or `@cal/ui` (which currently carries React Native peer dependencies).
   - All web visual styling lives under `apps/web` using plain CSS, CSS custom properties, and CSS Modules. No external UI frameworks or utility-class engines (e.g., Tailwind).
3. **Shared Contracts & Domain:**
   - Shared domain logic lives in `packages/domain` (pure TypeScript, deterministic, platform-neutral).
   - Shared validation schemas live in `packages/schemas` (Zod).
   - Generated database types live in `packages/types`.
   - Backend logic, RLS, and Edge Functions in `supabase/` remain shared.
4. **Data Access & State Architecture:**
   - Server state belongs to TanStack Query (`@tanstack/react-query`).
   - Browser Supabase client lives in `apps/web/src/lib/supabase/client.ts` using the public anon key with RLS enforcement.
   - No database rows mirrored in UI state.
   - Web feature APIs stay inside `apps/web/src/features/<feature>/api`.
   - Web routes and pages must never call Supabase directly; they go through feature hooks and APIs.
5. **No Development Provenance Attribution:**
   - No AI model, agent, executor, or IDE attribution in tracked files.

---

## Roadmap & Progress

### Web Phase 0 — Architecture and Foundation

- **Goal:** Establish `@cal/web` workspace, TypeScript strict config, Vite build, environment validation, QueryClient, Supabase browser client, baseline theme/tokens, and CI/build integration.
- **Status:** Completed
- **Starting SHA:** `d01cb11518693f57340a25b3ba2e8fc017204729`
- **Implementation Completed:**
  - Workspace package `@cal/web` configured in `apps/web`
  - Strict TypeScript configuration (`tsconfig.json`) extending root
  - Vite + React 19 configuration (`vite.config.ts`, `index.html`, `src/vite-env.d.ts`)
  - Runtime environment validation (`apps/web/src/lib/env.ts`)
  - Browser Supabase client (`apps/web/src/lib/supabase/client.ts`) with `x-client-platform: web`
  - TanStack QueryClient with web defaults and error mapping (`apps/web/src/lib/query/query-client.ts`, `apps/web/src/lib/errors/app-error.ts`)
  - Semantic CSS custom properties design tokens and global reset (`apps/web/src/styles/theme.css`, `apps/web/src/styles/global.css`)
  - Monorepo integration scripts (`pnpm web`, `pnpm build`, root verification)
- **Tests / Verification:**
  - Strict typecheck passing (`tsc --noEmit`)
  - ESLint passing with web architectural boundary enforcement
  - Production Vite build passing (`dist/` asset bundles generated cleanly)
  - Full repo verification passing (`pnpm verify`)
- **Pushed SHA:** `6c1bfc61fc9bd78b24d6a354df5b6896a0282dcf`
- **CI:** PASS — [CI run 33909446293](https://github.com/Andrewy530/BCalAI/actions/runs/33909446293)
- **Blockers:** None
- **Next Action:** Evaluated and verified; proceed to Web Phase 2 planning

---

### Web Phase 1 — Authentication and Application Shell

- **Goal:** Browser Supabase authentication (email/password sign-in, session restoration, auth listener, sign-out), protected route guards, and desktop application shell with semantic sidebar navigation.
- **Status:** Completed
- **Starting SHA:** `d01cb11518693f57340a25b3ba2e8fc017204729`
- **Implementation Completed:**
  - Auth API network layer (`apps/web/src/features/auth/api/auth.api.ts`) using `@cal/schemas`
  - Session state listener and `AuthProvider` (`apps/web/src/features/auth/hooks/`)
  - Accessible controlled sign-in form (`apps/web/src/features/auth/components/SignInForm.tsx`)
  - Protected route guard (`apps/web/src/components/auth/ProtectedRoute.tsx`)
  - Desktop-first application shell (`apps/web/src/components/layout/AppShell.tsx`) with left sidebar navigation, user session info, and sign-out action
  - Foundation routes: `/login`, `/today`, `/calendar`, `/tasks`, `/search`, `/settings`
- **Tests / Verification:**
  - Typecheck, lint, formatting, production build (`pnpm verify`) all passing
- **Pushed SHA:** `6c1bfc61fc9bd78b24d6a354df5b6896a0282dcf`
- **CI:** PASS — [CI run 33909446293](https://github.com/Andrewy530/BCalAI/actions/runs/33909446293)
- **Blockers:** None
- **Next Action:** Pre-Phase 2 Evaluate shared data-access extraction

---

### Architectural Checkpoint: Evaluate Shared Data-Access Extraction

- **Evaluation:** Inspected `apps/mobile/src/features/tasks/api/tasks.api.ts`. The task data access layer consists of ~150 lines of PostgREST queries plus Zod row-to-domain schemas. Pure domain logic (`bucketTasks`, `compareTasks`, `formatDueDate`, `formatDuration`) is already shared via `@cal/domain`. Data schemas and types are already shared via `@cal/schemas` and `@cal/types`.
- **Decision:** Leave `apps/mobile` unchanged and implement web-specific task APIs under `apps/web/src/features/tasks/api`.
- **Rationale:** Creating a shared `@cal/data` package or abstracting Supabase clients across mobile (Expo/SecureStore/AsyncStorage) and web (Vite/localStorage) introduces heavy ceremony, client injection complexity, and cross-package versioning without providing tangible architectural benefits for a few lightweight PostgREST queries. Strict isolation between mobile and web is maintained.

---

### Web Phase 2 — Tasks / Inbox

- **Goal:** Desktop task list, task CRUD, completion toggle, snooze/due handling, lists/tags, and desktop task inspector.
- **Status:** Completed
- **Starting SHA:** `d80ff85a5c8dc0a6810b9f76beeb85df8466bd19`
- **Architectural Decision:** Implemented web-specific task APIs under `apps/web/src/features/tasks/api/tasks.api.ts` using web's typed Supabase client and `@cal/schemas`, leaving `apps/mobile` unchanged and maintaining strict isolation.
- **Implementation Completed:**
  - Extended centralized `queryKeys.tasks` with `lists` and `tags` helpers (`apps/web/src/lib/query/query-client.ts`).
  - Web tasks API module (`apps/web/src/features/tasks/api/tasks.api.ts`): row mapping schemas, PostgREST queries for `fetchTasks`, `fetchTask`, `fetchTaskLists`, `fetchTags`, `createTask`, `updateTask`, `setTaskCompleted` (with atomic status/completed_at constraint compliance), `deleteTask`, `snoozeTask`, `createTaskList`, `deleteTaskList`.
  - TanStack Query hooks (`apps/web/src/features/tasks/hooks/useTasks.ts`): queries with 30s stale time, optimistic completion toggle and deletion with error rollback, invalidation on settle.
  - Task grouping hook (`apps/web/src/features/tasks/hooks/useTaskBuckets.ts`): consuming `@cal/domain`'s `bucketTasks` and `compareTasks` to group work into overdue, due today, upcoming, someday, and completed.
  - Desktop-first UI components:
    - `TaskRow` (`apps/web/src/features/tasks/components/TaskRow.tsx` + CSS Module): accessible row with completion checkbox, title strike-through, priority badges, due date badges with semantic tones, duration pills, list indicators, fixed status, and hover quick actions (snooze, delete).
    - `TaskListPane` (`apps/web/src/features/tasks/components/TaskListPane.tsx` + CSS Module): desktop left pane with view tabs (Inbox, All, Done), list selector, quick-add form, section headers with item counts, empty and loading states.
    - `TaskInspector` (`apps/web/src/features/tasks/components/TaskInspector.tsx` + CSS Module): desktop right-side inspector panel for viewing and editing task title, notes, due date & time, duration presets, priority, list assignment, tag assignment, flexibility flag, snooze, delete, and save/cancel actions.
    - `TasksView` (`apps/web/src/features/tasks/components/TasksView.tsx` + CSS Module): 2-pane desktop workspace container with responsive layout.
    - AppShell integration (`apps/web/src/components/layout/AppShell.tsx` + CSS Module): full-bleed content layout for `/tasks`.
    - Page integration (`apps/web/src/pages/TasksPage.tsx`): mounts `TasksView`.
- **Tests / Verification:**
  - Automated unit tests in `apps/web/src/features/tasks/api/tasks.api.test.ts` (6 tests: row transformations, schema validation, invalid input rejection).
  - Automated unit tests in `apps/web/src/features/tasks/hooks/useTaskBuckets.test.ts` (3 tests: partitioning, priority/due-date ordering, list filtering).
  - Full repo verification passing (`pnpm verify`: format check, lint, typecheck, 165 unit tests, production build).
  - Production build passing (`pnpm --filter @cal/web build`).
  - Git whitespace check passing (`git diff --check`).
- **Pushed SHA:** `d8c3eb9e1754bae19f25c702699ee23506af67a8`
- **CI:** PASS — [CI run 33929579271](https://github.com/Andrewy530/BCalAI/actions/runs/33929579271)
- **Blockers:** None
- **Remaining Work:** Web Phase 3 — Calendar Read Surface
- **Next Action:** Proceed to Web Phase 3 planning

---

### Web Phase 3 — Calendar Read Surface

- **Goal:** Calendar list, bounded event reads, recurrence expansion via `@cal/domain`, day/week/month desktop calendar architecture, all-day event handling, hidden calendar filtering, and timezone correctness.
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** None
- **Next Action:** Pending Phase 2

---

### Web Phase 4 — Calendar / Event Editing

- **Goal:** Internal event CRUD, calendar CRUD/visibility, recurrence editing, provider-owned event write rules, desktop event editor.
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** None
- **Next Action:** Pending Phase 3

---

### Web Phase 5 — Today / Search / Settings

- **Goal:** Merged Today surface, unified search across events/tasks, planning preferences, account settings, and integration overview.
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** None
- **Next Action:** Pending Phase 4

---

### Web Phase 6 — Provider Integrations

- **Goal:** Google and Microsoft connection management, calendar import/visibility/sync health, browser OAuth callback handling, preserving provider-first write architecture.
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** None
- **Next Action:** Pending Phase 5

---

### Web Phase 7 — Find Time

- **Goal:** Consume hardened Sprint 6 proposal endpoint, proposal selection UX, confirmation flow, Pro entitlement rendering (no client-side availability calculation).
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** Finalized subscription/entitlement architecture
- **Next Action:** Pending Phase 6

---

### Web Phase 8 — Production Web Hardening

- **Goal:** Accessibility audit, keyboard shortcuts, responsive behavior, performance optimization, error boundaries, browser compatibility matrix, security/privacy review, deployment configuration.
- **Status:** Planned
- **Starting SHA:** TBD
- **Implementation Completed:** TBD
- **Tests / Verification:** TBD
- **Pushed SHA:** TBD
- **CI:** TBD
- **Blockers:** None
- **Next Action:** Pending Phase 7
