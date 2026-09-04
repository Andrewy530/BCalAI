# Calendar + Reminders App — Product & Technical Plan

> **Working document**  
> Research checked: **August 30, 2026**  
> Target: **iOS-first, cross-platform-ready**  
> Team: **2 developers / AI-assisted development**

---

## Repository status after Sprint 5

- Sprints 0–4 are complete/implemented. Sprint 4 delivered the Google
  provider, and its major OAuth, import, sync, and provider-first write flows
  were verified against the live Google API.
- Sprint 5 Microsoft/Outlook implementation is complete in code: OAuth, Graph
  calendar listing, fixed-window initial sync, delta sync, normalization,
  recurrence translation, provider-first CRUD, account-scoped subscriptions,
  webhook enqueueing, renewal/teardown, reconnect/disconnect, and shared mobile
  integration are present behind the provider abstraction.
- Automated verification is mixed by environment. Targeted TypeScript,
  domain/mobile tests, ESLint, Prettier, and diff checks passed on the current
  Windows host; Deno, Supabase CLI/Docker, and the aggregate `pnpm verify`
  path were unavailable or did not reach project scripts there. The exact
  evidence is maintained in [`docs/sprint-5-active.md`](docs/sprint-5-active.md).
- Microsoft live webhook delivery, subscription renewal/teardown, provider
  CRUD, and device/deep-link testing retain external-verification gaps recorded
  in the Sprint 5 tracker. Sprint 6 — AI Pro prototype — has completed its
  architecture audit and deterministic server Find Time path; model ranking,
  persistence/confirmation, mobile UI, and RevenueCat remain. See
  [`docs/sprint-6-active.md`](docs/sprint-6-active.md).

## 1. Executive Summary

We are building a **calendar + reminders productivity app** inspired by three products for different reasons:

- **Business Calendar 2** — dense, useful calendar functionality and power-user scheduling workflows.
- **Notion** — flexible organization, lists, projects, notes, properties, and customizable information structure.
- **Copilot Money** — the visual benchmark: polished card-based interface, excellent information hierarchy, smooth interactions, focused screens, tasteful animations, and a premium consumer-app feel.

The product opportunity is to create a modern calendar/reminder app that feels **premium and pleasant on iOS**, while offering some of the practical calendar functionality that makes Business Calendar 2 compelling on Android.

The first release should **not** try to become Notion, an email client, an AI agent, a full team collaboration suite, and a calendar replacement simultaneously. The foundation should be intentionally designed for those expansions, but the MVP should focus on being an excellent personal calendar and reminder app.

### Recommended foundation

**Yes — use Supabase.** It is a strong fit for this project because the core data is relational (users, calendars, events, reminders, projects, tags, integrations, sync state, subscriptions), and Supabase provides PostgreSQL, Auth, Row Level Security, Edge Functions, Cron, Realtime, and encrypted secret storage through Vault.

### Recommended tech stack

- **Mobile:** React Native + Expo + TypeScript
- **Navigation:** Expo Router
- **Backend:** Supabase PostgreSQL
- **Auth:** Supabase Auth
- **Server/API layer:** Supabase Edge Functions
- **Background jobs:** Supabase Cron + Edge Functions
- **Secrets / provider credentials:** Supabase Vault + server-only secrets
- **Server-state fetching/cache:** TanStack Query
- **Lightweight client UI state:** Zustand
- **Validation:** Zod
- **Forms:** React Hook Form
- **Animation:** React Native Reanimated
- **Gestures:** React Native Gesture Handler
- **Notifications:** expo-notifications
- **Device calendar integration:** expo-calendar / iOS EventKit when needed
- **Subscriptions:** RevenueCat
- **AI:** server-side AI provider abstraction; OpenAI Responses API is a strong first provider
- **Crash reporting:** Sentry
- **CI/CD:** GitHub Actions + Expo EAS + Supabase migrations

### Most important architectural rule

**The AI should not be responsible for calculating whether a time slot is actually free.**

Build a deterministic scheduling engine that computes availability from calendar data. AI should interpret intent, estimate/normalize scheduling preferences, rank valid time slots, and explain recommendations. This keeps the calendar trustworthy.

---

# 2. Product Vision

## Product statement

A beautiful personal planning app that combines **calendar, reminders, tasks, and intelligent time planning** in one place.

Users should be able to:

1. See their entire day/week/month quickly.
2. Capture something they need to do in seconds.
3. Connect existing calendars.
4. Receive useful reminders.
5. Ask the app to find time for unscheduled work.
6. Eventually let AI reorganize flexible work around fixed commitments.

## Product promise

> **Know what you need to do, know when you can do it, and make scheduling it effortless.**

---

# 3. Product Positioning

## What we are building

A consumer productivity app with:

- Calendar views for serious scheduling.
- A task/reminder inbox for quick capture.
- Flexible task lists/projects.
- External calendar synchronization.
- Clean visual organization.
- AI-assisted time blocking as a premium feature.

## What we are NOT building in v1

Do not build these before the core experience is excellent:

- Full Notion-style page/database editor.
- Team workspaces.
- Slack replacement.
- Full email inbox/client.
- Desktop app.
- Web app.
- Home-screen widgets.
- Complex automation builder.
- AI that autonomously modifies an entire calendar without confirmation.
- Dozens of third-party integrations.

These can be supported by the architecture without being MVP requirements.

---

# 4. UX / Visual Direction

## Copilot Money as a design reference

Apple currently lists Copilot Money as an **Editors' Choice** app, and Apple's description specifically praises its elegant visuals and enjoyable interface. That validates the type of design quality we want to target.

We should **take inspiration from the design principles, not copy the product pixel-for-pixel**.

### Design qualities to emulate

- Strong visual hierarchy.
- Large, readable section titles.
- Rounded cards with purposeful spacing.
- Dense information that still feels calm.
- Smooth screen transitions.
- Responsive micro-interactions.
- High-quality dark mode.
- Limited use of accent color rather than visual clutter.
- Clear empty states.
- Progressive disclosure: show the essential information first, deeper details after a tap.
- Subtle haptics for meaningful interactions.
- Bottom sheets for quick creation/editing.
- Charts/visual summaries only when they provide real planning value.

## Proposed navigation

Use a simple bottom tab structure initially:

1. **Today**
2. **Calendar**
3. **Tasks**
4. **Search**
5. **Settings/Profile**

A persistent or highly accessible **Quick Add** action should let users create:

- Event
- Reminder/task
- Time block

Later, Quick Add can understand natural-language input.

---

# 5. Core User Flows

## A. Morning check-in

1. Open app.
2. Today screen shows:
   - Date
   - Upcoming events
   - Tasks due today
   - Unscheduled important tasks
   - Free-time summary
3. User can immediately mark tasks complete, postpone them, or schedule them.

## B. Quick reminder capture

1. Tap Quick Add.
2. Enter: `Finish supply chain report Friday`.
3. App creates a task with a due date.
4. Free users can schedule manually.
5. Pro users can tap **Find Time**.

## C. AI Find Time

1. User has a task with duration + deadline.
2. User taps **Find Time**.
3. Scheduling engine determines valid open slots.
4. AI ranks the valid options using preferences/context.
5. App proposes one or several placements.
6. User confirms.
7. Calendar event/time block is created.

## D. Connected calendar

1. User connects Google or Microsoft.
2. App requests the smallest required permissions.
3. Backend performs initial calendar sync.
4. Events appear in the app.
5. Changes are synchronized incrementally afterward.

---

# 6. Feature Roadmap

## Phase 0 — Foundation

Build this before feature expansion. The status markers below are reconciled
against the current repository; unchecked items remain future or
platform-specific work.

### Project foundation

- [x] Monorepo/project structure
- [x] TypeScript strict mode
- [x] ESLint + Prettier
- [x] Environment variable strategy
- [x] Supabase local development
- [x] Database migration workflow
- [x] Auth foundation
- [x] RLS policies
- [x] Design tokens
- [x] Reusable UI primitives
- [x] Error boundaries
- [x] Logging/error reporting seam; Sentry wiring remains future work
- [x] CI checks
- [ ] Development builds for both developers

### Design system primitives

Create these once rather than styling each screen independently:

- `Screen`
- `Text`
- `Button`
- `IconButton`
- `Card`
- `ListRow`
- `BottomSheet`
- `TextField`
- `DatePickerField`
- `TimePickerField`
- `Chip`
- `Badge`
- `Avatar`
- `Divider`
- `EmptyState`
- `LoadingState`
- `ErrorState`

---

## Phase 1 — Core MVP: Calendar + Reminders

### Authentication

- [x] Email sign-up/sign-in
- [x] Sign in with Apple
- [ ] Google sign-in (distinct from Google Calendar connection)
- [x] Session persistence
- [x] Account deletion
- [x] Basic profile/preferences

### Today screen

- [x] Today's events
- [x] Tasks due today
- [x] Overdue tasks
- [x] Unscheduled tasks
- [x] Current/next event
- [x] Simple free-time indicator
- [x] Quick Add

### Calendar

#### Required views

- [x] Month
- [x] Week
- [x] Day
- [x] Agenda/list

#### Event capabilities

- [x] Create event
- [x] Edit event
- [x] Delete event
- [x] Title
- [x] Start/end datetime
- [x] All-day event
- [x] Notes
- [x] Location
- [x] Calendar selection
- [x] Event color/calendar color
- [x] Recurrence
- [x] Reminder/alert timing
- [x] Time zone

### Calendar preferences

- [x] Start week on Sunday/Monday
- [x] 12-hour / 24-hour clock
- [ ] Default event duration
- [ ] Visible calendars
- [ ] Default calendar selection
- [x] Working hours
- [ ] Theme preference

### Tasks / reminders

- [x] Inbox
- [x] Task title
- [x] Notes
- [x] Due date
- [x] Due time
- [x] Priority
- [x] Estimated duration
- [x] Completed state
- [ ] Repeating task UI
- [x] List/project assignment
- [ ] Tags UI
- [x] Snooze/postpone
- [x] Search; filtering remains future work

### Notifications

- [x] Local task reminders
- [x] Event reminders
- [x] Due-soon notifications
- [x] Notification preferences
- [x] Deep-link from notification to item

Expo supports both scheduled local notifications and remote push notifications. Begin with local notifications for user-created reminders; introduce remote notifications only when server-driven behavior is needed.

---

## Phase 2 — External Calendar Sync

### Google Calendar

- [x] Connect Google account using OAuth
- [x] List calendars
- [x] Select which calendars to sync
- [x] Initial event sync
- [x] Incremental sync using `syncToken`
- [x] Google Calendar push notification webhook implementation
- [x] Create/update/delete Google events from app
- [x] Refresh/re-auth flows
- [x] Disconnect integration

Major OAuth, import, sync, and provider-first write flows were verified against
the live Google API in Sprint 4. Real webhook delivery and some device-level
flows remain unexercised; see `docs/sprint-4-active.md` for historical evidence.

### Microsoft Outlook / Microsoft 365 Calendar

- [x] Connect Microsoft account using OAuth
- [x] List calendars
- [x] Select calendars
- [x] Initial event sync
- [x] Incremental sync using Microsoft Graph delta query
- [x] Microsoft Graph webhook subscriptions
- [x] Subscription renewal/lifecycle handling
- [x] Create/update/delete events
- [x] Disconnect integration

Implementation is complete, but live Microsoft/Azure verification remains for
OAuth, Graph listing/import, delta sync, CRUD, webhook delivery, renewal,
teardown, and device/deep-link behavior.

### Apple/iOS device calendar

Later in this phase or a later release:

- [ ] Read device calendars with user permission
- [ ] Create events in iOS Calendar
- [ ] Optional Apple Reminders import

Expo's current `expo-calendar` package can access system calendars/events and, on iOS, reminders. It uses the native calendar capabilities underneath and requires the appropriate permissions for reading data.

---

# 7. Google + Microsoft Integration Research

## Short answer

**Yes, this is absolutely possible.**

There are two distinct integration problems:

1. **Calendar synchronization** — recommended early.
2. **Reading email to discover possible events/tasks** — possible, but should be implemented later because it has larger privacy, OAuth, security, and app-review implications.

---

## Google Calendar

Google Calendar provides an official Calendar API.

### Efficient sync pattern

Google documents an incremental synchronization model:

1. Perform an initial full sync.
2. Store the returned `nextSyncToken`.
3. On subsequent syncs, send the stored `syncToken`.
4. Receive only additions, changes, and deletions.
5. Store the new sync token.
6. If Google invalidates the token (for example, HTTP `410`), perform a new full sync.

Google also supports **push notification channels** for event/calendar changes. The webhook notification is effectively a signal that something changed; the backend should then perform the appropriate incremental sync.

### Recommended Google architecture

```text
Google Calendar
      │
      │ webhook notification
      ▼
Supabase Edge Function
      │
      │ syncToken request
      ▼
Google Calendar API
      │
      ▼
Normalize provider event
      │
      ▼
Supabase events table
      │
      ▼
Mobile app refresh / realtime update
```

---

## Gmail email scanning

Gmail also has an official API and push notification system.

A backend can call Gmail `users.watch`, receive mailbox-change notifications through Google Cloud Pub/Sub, track a `historyId`, and retrieve mailbox changes.

### Important warning

Some Gmail scopes are classified as **Sensitive** or **Restricted**. Google's current documentation says restricted scopes can require OAuth verification, and if restricted-scope data is stored or transmitted by your servers, a security assessment may be required.

Because of this, **do not make full Gmail inbox scanning a launch requirement**.

### Better rollout

#### First

Sync Google Calendar only.

#### Later

Offer an explicit optional feature such as:

> "Find events in my email"

Then request only the permissions required for that feature, with clear consent and privacy messaging.

---

## Microsoft Outlook / Microsoft 365

Microsoft Graph provides calendar and email APIs for personal Microsoft accounts and Microsoft 365 accounts.

### Calendar sync

Microsoft Graph supports a **delta query** for calendar events. The initial query retrieves the current data for a calendar view; subsequent requests use state tokens to retrieve incremental changes rather than downloading everything again.

For signed-in users, use delegated calendar permissions and request the least privilege necessary, generally beginning with read access and only requesting write access when the user enables two-way editing.

### Webhooks

Microsoft Graph supports change notifications through webhooks.

Your backend must:

- Expose a public HTTPS endpoint.
- Validate Microsoft's initial webhook verification request.
- Store subscription metadata.
- Renew subscriptions before they expire.
- Handle lifecycle notifications.
- Run a delta sync after relevant notifications.

### Outlook email scanning

Microsoft Graph supports message delta queries and mail change notifications as well.

As with Gmail, email access should be a separate opt-in integration rather than silently bundled with calendar access.

---

# 8. Recommended Integration Strategy

## MVP integration order

1. **Internal app calendar**
2. **Google Calendar**
3. **Microsoft Outlook Calendar**
4. **iOS device calendar / EventKit**
5. **Gmail event extraction**
6. **Outlook email event extraction**

Do not start with email extraction. Calendar APIs provide much of the value with far lower privacy and compliance complexity.

---

# 9. Supabase Decision

## Recommendation: Use Supabase

Supabase is an especially good fit for two developers trying to move quickly while preserving a production-quality architecture.

## Why it fits this product

### PostgreSQL

Calendar data is naturally relational:

- User owns calendars.
- Calendars contain events.
- Events can have attendees/tags.
- Users own task lists.
- Lists contain tasks.
- Tasks can create scheduled blocks.
- Provider accounts own sync cursors/tokens.
- Users have subscription entitlements.

Postgres is a better default here than designing everything as loosely structured documents.

### Auth

Supabase Auth can manage app identity while Google/Microsoft OAuth integrations are treated as **connected provider accounts**.

Important distinction:

- **App login account** = who the user is in our app.
- **Connected calendar account** = permission to synchronize a provider.

Do not make those the same concept in the database.

### Row Level Security

Enable RLS on every user-accessible table. A user should only be able to read or modify rows they own or are explicitly authorized to access.

### Edge Functions

Use Edge Functions for:

- OAuth callbacks
- Google sync
- Microsoft sync
- Provider webhooks
- AI scheduling requests
- Subscription webhooks
- Server-only mutations
- Email processing later

### Cron

Use Cron for recovery/reconciliation jobs such as:

- Refresh stale provider syncs
- Renew Microsoft webhook subscriptions
- Recreate Google watch channels before expiration
- Retry failed sync jobs
- Reconcile provider data occasionally in case webhook notifications are missed

### Vault

Supabase Vault stores encrypted secrets in Postgres. Use server-controlled secret storage for integration credentials where appropriate and ensure decrypted values are never exposed through client-accessible database APIs.

## What NOT to do

- Do not put Google/Microsoft refresh tokens in AsyncStorage.
- Do not expose service-role credentials to the mobile app.
- Do not call the AI provider directly from the mobile app with a secret API key.
- Do not disable RLS for convenience.
- Do not put OAuth/provider logic directly into UI components.

---

# 10. High-Level Architecture

```text
┌─────────────────────────────────────────────┐
│               React Native App              │
│                                             │
│  Screens → Features → Domain Services       │
│       │             │                       │
│       ├── TanStack Query                    │
│       ├── Zustand (UI-only state)           │
│       └── Local notification scheduling     │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│                 Supabase                    │
│                                             │
│  Auth                                       │
│  PostgreSQL + RLS                           │
│  Edge Functions                            │
│  Cron                                       │
│  Vault                                      │
│  Realtime (selectively)                     │
└──────────────┬──────────────┬───────────────┘
               │              │
        ┌──────▼──────┐ ┌─────▼─────────┐
        │ Google APIs │ │ Microsoft     │
        │ Calendar    │ │ Graph         │
        │ Gmail later │ │ Mail later    │
        └─────────────┘ └───────────────┘
               │
        ┌──────▼──────┐
        │ AI Provider │
        │ server-side │
        └─────────────┘
```

---

# 11. Tech Stack — Detailed Recommendation

## Mobile application

### React Native + Expo + TypeScript

Recommended because:

- One codebase for iOS and Android.
- Faster for two developers than maintaining Swift + Kotlin independently.
- Expo provides excellent development/build tooling.
- Native modules remain available through development builds.
- Expo Router gives structured file-based navigation.
- Device calendars, notifications, haptics, secure storage, deep links, and other native features can be added without abandoning React Native.

Use an **Expo development build early**, not Expo Go as the long-term environment. Expo's current documentation specifically recommends development builds for production applications and for native libraries/capabilities.

## Navigation

**Expo Router**

Keep route files intentionally small. Route files should compose feature screens rather than contain business logic.

## Server state

**TanStack Query**

Use for:

- Events
- Tasks
- Calendar lists
- Integration status
- Subscription status
- AI requests/results

It provides request caching, invalidation, retry behavior, and optimistic update patterns without turning global state into a giant store.

## UI-only global state

**Zustand**

Only use it for state that does not belong on the server, such as:

- Current calendar view
- Selected date
- Open modal/sheet state
- Temporary filters
- Draft UI preferences

Do not mirror the entire Supabase database into Zustand.

## Validation

**Zod**

Use one schema for each domain input/output shape where practical.

Examples:

- `CreateEventSchema`
- `UpdateTaskSchema`
- `AiScheduleRequestSchema`
- `ProviderWebhookSchema`

## Forms

**React Hook Form** + Zod resolver.

## Animations

**React Native Reanimated**

Use motion carefully:

- Card transitions
- Sheet transitions
- Calendar date selection
- Drag/drop feedback
- Task completion
- Tab state changes

Animation should communicate state change, not simply decorate the interface.

## Notifications

**expo-notifications**

Start with scheduled local notifications; add server push notifications when needed.

## Subscriptions

**RevenueCat**

This avoids building StoreKit/Google Play Billing subscription infrastructure from scratch and provides one entitlement layer across platforms.

---

# 12. Professional Project Structure

Use a monorepo-style structure even if only the mobile application exists initially. It creates clear boundaries for future web/admin tooling without forcing a rewrite.

```text
calendar-app/
├── apps/
│   └── mobile/
│       ├── app/                         # Expo Router routes ONLY
│       │   ├── _layout.tsx
│       │   ├── (auth)/
│       │   │   ├── sign-in.tsx
│       │   │   └── onboarding.tsx
│       │   └── (tabs)/
│       │       ├── _layout.tsx
│       │       ├── today.tsx
│       │       ├── calendar.tsx
│       │       ├── tasks.tsx
│       │       ├── search.tsx
│       │       └── settings.tsx
│       │
│       └── src/
│           ├── components/              # Shared app-level composition
│           │   └── app-shell/
│           │
│           ├── features/                # Feature-first organization
│           │   ├── auth/
│           │   │   ├── api/
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   ├── screens/
│           │   │   ├── schemas/
│           │   │   └── types.ts
│           │   │
│           │   ├── calendar/
│           │   │   ├── api/
│           │   │   ├── components/
│           │   │   │   ├── day-view/
│           │   │   │   ├── week-view/
│           │   │   │   ├── month-view/
│           │   │   │   └── agenda-view/
│           │   │   ├── hooks/
│           │   │   ├── screens/
│           │   │   ├── services/
│           │   │   ├── utils/
│           │   │   └── types.ts
│           │   │
│           │   ├── events/
│           │   ├── tasks/
│           │   ├── notifications/
│           │   ├── integrations/
│           │   ├── ai-scheduling/
│           │   ├── subscriptions/
│           │   ├── search/
│           │   └── settings/
│           │
│           ├── lib/
│           │   ├── supabase/
│           │   │   ├── client.ts
│           │   │   └── auth.ts
│           │   ├── query/
│           │   │   └── query-client.ts
│           │   ├── notifications/
│           │   ├── analytics/
│           │   └── errors/
│           │
│           ├── store/                   # Small UI-only Zustand stores
│           │   ├── calendar-view.store.ts
│           │   └── quick-add.store.ts
│           │
│           ├── theme/
│           │   ├── colors.ts
│           │   ├── spacing.ts
│           │   ├── radius.ts
│           │   ├── typography.ts
│           │   ├── motion.ts
│           │   └── theme.ts
│           │
│           ├── hooks/
│           ├── utils/
│           └── types/
│
├── packages/
│   ├── ui/                              # Reusable design-system primitives
│   │   └── src/
│   │       ├── button/
│   │       ├── card/
│   │       ├── text/
│   │       ├── sheet/
│   │       ├── form/
│   │       └── index.ts
│   │
│   ├── domain/                          # Pure business/domain logic
│   │   └── src/
│   │       ├── calendar/
│   │       ├── scheduling/
│   │       ├── recurrence/
│   │       └── tasks/
│   │
│   ├── schemas/                         # Shared Zod/API schemas
│   ├── types/                           # Shared generated/manual types
│   ├── config/                          # ESLint/TS shared config
│   └── testing/
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/
│   └── functions/
│       ├── _shared/
│       │   ├── auth/
│       │   ├── errors/
│       │   ├── http/
│       │   ├── providers/
│       │   │   ├── google/
│       │   │   └── microsoft/
│       │   └── ai/
│       │
│       ├── oauth-google-start/
│       ├── oauth-google-callback/
│       ├── integrations-calendars/
│       ├── integrations-import/
│       ├── integrations-disconnect/
│       ├── provider-event-write/
│       ├── sync-run/
│       ├── sync-cron/
│       ├── webhook-google/
│       ├── oauth-microsoft-start/
│       ├── oauth-microsoft-callback/
│       ├── webhook-microsoft/
│       ├── ai-find-time/                # planned — Sprint 6
│       ├── revenuecat-webhook/          # planned — Sprint 6
│       └── delete-account/
│
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── sync-engine.md
│   ├── ai-scheduling.md
│   ├── design-system.md
│   └── decisions/
│       ├── 0001-react-native-expo.md
│       ├── 0002-supabase.md
│       └── 0003-provider-sync-model.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── preview-build.yml
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json                         # Optional initially
├── tsconfig.base.json
├── eslint.config.js
├── prettier.config.js
└── README.md
```

---

# 13. Rules to Prevent Monolithic Files

Use these as team rules from day one.

## File-size guideline

A file becoming larger than roughly **250–350 lines** should trigger a review, not an automatic refactor. The important question is whether it contains multiple responsibilities.

## Screen rule

A screen should generally do only four things:

1. Read route parameters.
2. Call feature hooks.
3. Compose feature components.
4. Trigger navigation.

A screen should **not** contain provider API logic, SQL logic, complex date algorithms, or giant style objects.

## Component rule

Separate:

- Display components
- Domain logic
- API calls
- Data mapping
- State orchestration

## Backend rule

Do not create a single `api.ts` Edge Function with every endpoint.

Provider functionality should be separated by domain and reusable provider adapters should live under `_shared/providers`.

---

# 14. Database Model

Below is the recommended conceptual schema. Exact columns should be defined through migrations.

## `profiles`

```text
id                  uuid PK -> auth.users
full_name           text
avatar_url          text nullable
timezone            text
week_starts_on      smallint
hour_cycle          text
default_task_minutes integer
created_at          timestamptz
updated_at          timestamptz
```

## `calendars`

```text
id                  uuid PK
user_id             uuid FK
name                text
color               text
source_type         internal | google | microsoft | device
provider_account_id uuid nullable
provider_calendar_id text nullable
is_visible          boolean
is_default          boolean
is_read_only        boolean
created_at
updated_at
```

## `events`

```text
id                    uuid PK
user_id               uuid FK
calendar_id           uuid FK
title                  text
description            text nullable
location               text nullable
start_at                timestamptz
end_at                  timestamptz
all_day                 boolean
timezone                text
status                  confirmed | tentative | cancelled
recurrence_rule         text/jsonb nullable
source_type             internal | google | microsoft | device
provider_event_id       text nullable
provider_etag           text nullable
provider_updated_at     timestamptz nullable
sync_status             synced | pending | failed | conflict
created_at
updated_at
```

Recommended unique index:

```text
(provider_account_id, provider_event_id)
```

where applicable.

## `task_lists`

```text
id
user_id
name
color
position
created_at
updated_at
```

## `tasks`

```text
id
user_id
list_id nullable
title
description nullable
status                  open | scheduled | completed | archived
priority                low | normal | high | urgent
due_at nullable
estimated_minutes nullable
scheduled_event_id nullable
is_flexible             boolean
recurrence_rule nullable
completed_at nullable
created_at
updated_at
```

## `tags`

```text
id
user_id
name
color
```

## `task_tags`

```text
task_id
tag_id
```

## `provider_accounts`

```text
id
user_id
provider                google | microsoft
provider_user_id
email
status                  active | expired | revoked | error
scopes                   text[]
secret_reference_id      uuid/text    # reference to protected token storage
webhook_channel_id       text nullable # account-scoped watch, when applicable
webhook_resource_id      text nullable
webhook_subscription_id  text nullable
webhook_token            text nullable # server-only clientState/channel token
webhook_expires_at       timestamptz nullable
connected_at
last_sync_at
created_at
updated_at
```

**Never expose refresh tokens through normal client queries.**

## `calendar_sync_states`

```text
id
provider_account_id
calendar_id
provider_calendar_id
sync_cursor              text nullable
webhook_channel_id       text nullable
webhook_resource_id      text nullable
webhook_subscription_id  text nullable
webhook_expires_at       timestamptz nullable
last_full_sync_at        timestamptz nullable
last_incremental_sync_at timestamptz nullable
last_error               text nullable
retry_count              integer
updated_at
```

Google `syncToken` and Microsoft delta-link/state data belong here. Google
calendar-scoped watch bookkeeping remains on this row; Microsoft Graph's
account-scoped subscription bookkeeping is stored on `provider_accounts`.

Provider event rows may also carry `recurring_event_id` and
`recurrence_original_start_at` so moved or cancelled occurrences can be
reconciled without changing the series master's RRULE.

## `ai_schedule_requests`

```text
id
user_id
task_id
status                  pending | proposed | accepted | rejected | failed
constraints             jsonb
created_at
completed_at nullable
```

## `ai_schedule_suggestions`

```text
id
request_id
start_at
end_at
score
reason
rank
accepted_at nullable
```

## `subscriptions`

```text
id
user_id
provider                revenuecat
entitlement
status
expires_at nullable
raw_customer_id
updated_at
```

---

# 15. Calendar Sync Engine Design

This is one of the most important pieces to design correctly.

## Provider adapter interface

Do not spread Google/Microsoft-specific code throughout the app.

Conceptually:

```ts
interface CalendarProvider {
  listCalendars(accountId: string): Promise<ExternalCalendar[]>;
  initialSync(calendarId: string): Promise<SyncResult>;
  incrementalSync(calendarId: string, cursor: string): Promise<SyncResult>;
  createEvent(input: ProviderEventInput): Promise<ProviderEvent>;
  updateEvent(providerEventId: string, input: ProviderEventInput): Promise<ProviderEvent>;
  deleteEvent(providerEventId: string): Promise<void>;
  renewWatch?(calendarId: string): Promise<WatchRegistration>;
}
```

Implement:

- `GoogleCalendarProvider`
- `MicrosoftCalendarProvider`

Normalize both into the same internal event model.

## Write strategy

For externally owned events:

```text
User edits event
    ↓
Send provider mutation FIRST
    ↓
Provider confirms
    ↓
Update normalized local copy
```

This reduces divergence between provider and local state.

## Prevent sync loops

Track:

- Provider event ID
- Provider revision/etag when available
- Last provider update timestamp
- Local mutation status
- Mutation idempotency key

A provider webhook that reflects our own recent write should update/confirm the local row rather than generate a second write back to the provider.

## Reliability

Webhooks are optimization signals, not the sole source of truth.

Google explicitly notes that push notifications are not perfectly reliable. Microsoft also documents lifecycle/missed-notification considerations.

Therefore use:

- Webhook-driven incremental sync
- Periodic reconciliation
- Retry queue/backoff
- Idempotent upserts
- Dead-letter/error visibility for failed syncs

---

# 16. AI Scheduling Architecture

## Paid feature concept

**AI Scheduler / Find Time**

The user creates a reminder or task without assigning a time. The app finds appropriate space and proposes a schedule.

## Required task metadata

Minimum:

- Task title
- Estimated duration
- Due date or scheduling horizon

Useful optional fields:

- Priority
- Earliest start
- Latest end
- Preferred time of day
- Splittable vs non-splittable
- Work/personal category
- Energy preference
- Required location
- Minimum buffer

## Scheduling pipeline

```text
Task
  ↓
Normalize constraints
  ↓
Fetch calendar events + working hours
  ↓
Deterministic free-slot engine
  ↓
Candidate valid slots
  ↓
AI ranking / intent interpretation
  ↓
Structured schedule proposal
  ↓
User confirmation
  ↓
Create time-block event
```

## Why this is better than asking an LLM directly

The deterministic engine guarantees:

- No event overlap
- Correct time math
- Correct buffers
- Working-hour compliance
- Deadline compliance

AI handles the fuzzy part:

- “I focus better in the morning.”
- “Don't put this immediately after class.”
- “I want gym before dinner.”
- “Fit this somewhere this week.”

## AI tools/functions

The model should have narrowly defined server tools such as:

```text
get_task(task_id)
get_calendar_window(start, end)
get_available_slots(constraints)
rank_schedule_slots(task, slots, preferences)
create_time_block(task_id, slot_id)
reschedule_time_block(event_id, slot_id)
```

The model should never receive permission to execute arbitrary SQL.

## Confirmation policy

### Initial paid release

AI only **proposes** schedule changes.

### Later opt-in feature

Allow users to turn on “Auto Schedule Flexible Tasks,” with clear safeguards and an undo history.

---

# 17. Free vs Paid Product Model

## Free

- Core calendar
- Calendar views
- Tasks/reminders
- Local notifications
- Projects/lists
- Basic calendar sync
- Manual time blocking
- Search
- Basic themes/preferences

## Pro / AI subscription

Potential features:

- AI Find Time
- AI reschedule missed tasks
- Smart daily plan
- Natural-language scheduling
- Automatic task duration suggestions
- Automatic flexible time blocking
- Schedule cleanup recommendations
- Weekly planning assistant
- Email event/task extraction
- Advanced planning insights
- More automation rules

Do not paywall basic trust features like reliable calendar sync simply to force conversion. The premium tier should feel valuable because it **saves planning time**.

---

# 18. Email-to-Calendar Intelligence — Later Phase

This should be treated as an independent product feature.

## Example use cases

The app could detect:

- Flight confirmations
- Hotel reservations
- Restaurant reservations
- Interviews
- Appointments
- Concert tickets
- Assignment deadlines
- Meeting confirmations

## Safer user experience

Do not automatically add every inferred item.

Use an inbox such as:

> **Suggested from email**

Each suggestion displays:

- Extracted title
- Date/time
- Location
- Source email
- Confidence
- Add / Ignore

Later, users can enable auto-add for specific high-confidence categories.

## Privacy strategy

- Request email access separately from calendar access.
- Explain exactly what is read and why.
- Minimize retained message content.
- Prefer extracting required structured data and discarding unnecessary email body data.
- Never use user emails for model training unless the product has a separately explicit and legally reviewed policy that permits it.
- Provide disconnect and deletion controls.

---

# 19. Offline and Local-First Behavior

Calendars must still feel fast when connectivity is weak.

## MVP target

- Cache recently loaded calendar ranges.
- Cache task lists.
- Optimistically update simple task actions.
- Queue mutations when reasonable.
- Clearly show sync failures rather than silently losing edits.

## Later

If offline usage becomes a major differentiator, introduce a dedicated local persistence layer and mutation queue. Avoid overengineering a full local-first replication engine before validating the product.

---

# 20. Security Checklist

The checklist below records implemented controls; live/device verification is
tracked separately in `docs/sprint-5-active.md`.

## Database

- [x] RLS enabled on all exposed user tables
- [x] RLS tests included in CI
- [x] Service role never bundled with app
- [x] Sensitive provider token tables/views inaccessible to client roles
- [x] Database migrations reviewed in PRs

## OAuth

- [x] Least-privilege scopes
- [x] PKCE where applicable
- [x] Secure redirect/deep-link handling (device verification remains pending)
- [x] Refresh token protection
- [x] Provider revoke/disconnect path
- [x] Reauthentication on expired consent

## Webhooks

- [x] Validate webhook authenticity/token state
- [x] Public HTTPS only
- [x] Idempotency
- [ ] Rate limits (follow-up hardening; not a Sprint 5 blocker)
- [x] Fast acknowledgement
- [x] Asynchronous follow-up processing where appropriate

## AI

- [ ] AI key only server-side
- [ ] Validate every model output
- [ ] Structured schemas
- [ ] No arbitrary database execution
- [ ] Rate limits per user
- [ ] Subscription entitlement check server-side
- [ ] Avoid logging sensitive calendar/email content

## Privacy

- [ ] Privacy policy before external beta
- [ ] Account/data deletion flow
- [ ] Connected-account deletion/revocation
- [ ] Clear provider scopes
- [ ] Data retention policy
- [ ] Email feature is explicit opt-in

---

# 21. Team Workflow for Two Developers

The biggest risk with two people vibe-coding simultaneously is not development speed — it is **architecture drift**.

## Repository workflow

Use GitHub with protected `main`.

Suggested branches:

```text
main
feature/calendar-week-view
feature/task-quick-add
fix/google-sync-token
chore/design-tokens
```

## PR rules

Every PR should:

- Solve one coherent problem.
- Pass type checking.
- Pass linting.
- Pass tests.
- Include screenshots/video for UI changes.
- Include a migration if the database contract changed.
- Avoid unrelated refactors.

## Ownership lanes

For the first month:

### Developer A — Product/UI lane

- Design system
- Today
- Calendar views
- Event editor
- Tasks
- Animations

### Developer B — Platform/data lane

- Supabase
- Database
- Auth
- Notifications
- Google integration
- Microsoft integration

Both review each other's work so knowledge is not siloed.

## Architecture Decision Records

When making a decision that will affect months of development, write a small ADR under:

```text
docs/decisions/
```

Example:

```text
0001-react-native-expo.md
0002-use-supabase.md
0003-provider-sync-model.md
```

This is especially valuable when AI coding tools are involved because the repository itself becomes the source of truth.

---

# 22. AI/Vibe-Coding Repository Rules

Create an `AGENTS.md` or equivalent repository instruction file containing rules such as:

```md
# Engineering Rules

- TypeScript strict mode is mandatory.
- Never place business logic inside Expo Router route files.
- Never create provider API calls directly inside React components.
- All Supabase schema changes must be migrations.
- RLS is mandatory for user-owned tables.
- Never expose service-role keys or provider refresh tokens to the mobile client.
- Prefer feature folders over global catch-all folders.
- Reuse design-system primitives instead of one-off styles.
- Validate external inputs with Zod.
- AI output must be validated before it changes user data.
- Calendar conflict calculation must use deterministic scheduling code, not LLM reasoning.
- New files should have one clear responsibility.
- Do not add dependencies when the existing stack can solve the problem cleanly.
```

This helps keep generated code consistent between both developers.

---

# 23. Testing Strategy

## Unit tests

Focus on high-risk pure logic:

- Recurrence calculations
- Time-zone conversion
- Free-slot generation
- Conflict detection
- Duration splitting
- Provider normalization
- Sync state transitions

## Component tests

Use React Native Testing Library for:

- Event editor
- Task editor
- Filters
- Empty/loading/error states
- Subscription gates

## Integration tests

Test:

- Supabase RLS
- Event CRUD
- Task CRUD
- OAuth callback state
- Provider event normalization
- Webhook idempotency

## E2E

Before public release, cover critical flows:

1. Create account
2. Create task
3. Create event
4. Receive reminder
5. Connect Google
6. See synced event
7. Edit synced event
8. Purchase/restore Pro
9. Use AI Find Time
10. Delete account

---

# 24. Observability

Add before external TestFlight, not after users report invisible failures.

Track:

- App crashes
- API failures
- OAuth failure rate
- Calendar sync latency
- Sync error rate by provider
- Webhook processing failures
- AI request failures
- AI suggestion acceptance rate
- Notification scheduling failures
- Subscription entitlement errors

Use structured error codes such as:

```text
PROVIDER_AUTH_EXPIRED
PROVIDER_SYNC_CURSOR_INVALID
MICROSOFT_SUBSCRIPTION_EXPIRED
EVENT_PROVIDER_CONFLICT
AI_NO_VALID_SLOT
AI_RATE_LIMITED
SUBSCRIPTION_REQUIRED
```

---

# 25. Build Order / Suggested Sprints

## Sprint 0 — Engineering foundation

Status: **COMPLETE / HISTORICAL**

- Repository
- Expo app
- Development builds
- Supabase local/project setup
- Auth
- RLS baseline
- Design tokens
- Core UI primitives
- CI

### Deliverable

A user can create an account, enter the authenticated app shell, and see polished empty screens.

---

## Sprint 1 — Tasks + quick capture

Status: **COMPLETE / HISTORICAL**

- Task schema
- Inbox
- Create/edit task
- Complete task
- Due date/time
- Priority
- Estimated duration
- Quick Add
- Local notifications

### Deliverable

The app is already useful as a basic reminder product.

---

## Sprint 2 — Internal calendar

Status: **COMPLETE / HISTORICAL**

- Calendar schema
- Event CRUD
- Day view
- Week view
- Agenda
- Month view
- Event editor
- Calendar colors

### Deliverable

The app works as a standalone calendar without integrations.

---

## Sprint 3 — Today + polish

Status: **COMPLETE / HISTORICAL**

- Today dashboard
- Merge events/tasks chronologically
- Overdue state
- Free-time summary
- Motion/haptics
- Search
- Settings

### Deliverable

The product begins to feel like a coherent premium consumer app.

---

## Sprint 4 — Google Calendar

Status: **COMPLETE / HISTORICAL**

- Provider architecture
- OAuth
- Calendar selection
- Initial sync
- Incremental sync
- Webhook
- Two-way event writes
- Failure/retry states

### Deliverable

Google Calendar can be used as a real connected calendar.

---

## Sprint 5 — Microsoft Calendar

Status: **IMPLEMENTATION COMPLETE / EXTERNAL VERIFICATION REMAINING**

- Microsoft OAuth
- Graph calendar adapter
- Delta sync
- Change-notification webhook
- Subscription renewal
- Two-way writes

### Deliverable

Both major external calendar ecosystems are implemented behind the provider
abstraction. Microsoft live OAuth, Graph, webhook, subscription-lifecycle, and
device verification remain before this sprint is fully verified.

---

## Sprint 6 — AI Pro prototype

Status: **PHASE 1 IMPLEMENTED AND VERIFIED — PHASE 2 NOT STARTED**

- Availability engine (existing foundation)
- Task constraints (existing schema; server normalization pending)
- Candidate slot generation (existing whole-duration engine)
- Deterministic server Find Time endpoint (implemented)
- Structured proposals
- Confirmation UI
- RevenueCat entitlement gate

### Deliverable

A paid user can ask the app to find time for an unscheduled task.

---

## Sprint 7 — Beta hardening

- Sync recovery
- Edge cases
- Time zones
- Recurrence bugs
- Onboarding
- Privacy text
- Analytics/crash monitoring
- TestFlight

---

# 26. Initial Ticket Backlog

Suggested first tickets in order:

1. Initialize Expo TypeScript app + Expo Router.
2. Configure development builds.
3. Initialize Supabase local development.
4. Set up migration workflow.
5. Create `profiles` table + RLS.
6. Implement authentication shell.
7. Build design tokens.
8. Build typography component.
9. Build Button/Card/ListRow primitives.
10. Build app tab navigation.
11. Create tasks schema + RLS.
12. Create task repository/API module.
13. Build task inbox screen.
14. Build task editor bottom sheet.
15. Implement task completion.
16. Add local reminder scheduling.
17. Create calendars/events schema + RLS.
18. Build event repository/API module.
19. Build event editor.
20. Build agenda view.
21. Build day view.
22. Build week view.
23. Build month view.
24. Build Today screen.
25. Add search.
26. Add provider-account schema.
27. Implement Google OAuth connection.
28. Implement Google initial sync.
29. Implement Google incremental sync.
30. Add Google Calendar watch webhook.
31. Implement Microsoft OAuth.
32. Implement Microsoft delta sync.
33. Add Microsoft change-notification webhook.
34. Build deterministic availability engine.
35. Add RevenueCat.
36. Build AI Find Time endpoint.
37. Build AI proposal UI.
38. Add Sentry.
39. Add critical E2E tests.
40. Prepare TestFlight beta.

---

# 27. Features to Delay Until After Product Validation

## Widgets

Widgets are valuable, but delay them until users demonstrate they repeatedly open the app to answer one of these questions:

- What do I have next?
- What do I need to do today?
- What is overdue?

Then build widgets around validated behaviors.

Potential widgets:

- Next event
- Today timeline
- Today tasks
- Quick Add
- Free time remaining

For iOS, widgets eventually require native WidgetKit integration/a native extension. The React Native/Expo choice does not prevent this, but it is a reason to use development builds and keep native extensibility available.

## Notion-like advanced structure

Later features could include:

- Custom task properties
- Saved views
- Filters
- Project pages
- Notes/blocks
- Templates
- Linked tasks/events

Do not build a general block editor in the MVP.

---

# 28. Key Product Decisions to Make Early

## Decision A — Source of truth

Recommended:

- Internal tasks: Supabase is source of truth.
- Internal events: Supabase is source of truth.
- Google-owned events: Google is source of truth; Supabase holds normalized synchronized copy.
- Microsoft-owned events: Microsoft is source of truth; Supabase holds normalized synchronized copy.

## Decision B — Two-way sync

Implemented decision:

Support two-way calendar editing. Read sync was validated before provider-owned
writes were enabled, and current writes remain provider-first: mutate Google or
Microsoft, wait for provider confirmation, then update the normalized local
copy.

## Decision C — AI autonomy

Recommended:

AI proposals require confirmation initially.

## Decision D — Email scanning

Recommended:

Separate opt-in feature after calendar integrations are stable.

## Decision E — iOS-first or both platforms at launch

Recommended:

Develop cross-platform from day one with React Native, but **optimize product QA and launch messaging for iOS first** because that is where the identified Business Calendar 2 gap is most relevant.

---

# 29. Suggested MVP Scope

If we aggressively protect scope, the first public beta should contain:

### Must-have

- Authentication
- Today screen
- Month/week/day/agenda calendar
- Internal event CRUD
- Internal task/reminder CRUD
- Lists/projects
- Due dates
- Estimated duration
- Local notifications
- Search
- Google Calendar sync
- Microsoft Calendar sync
- Light/dark mode
- Strong polished UI

### Beta Pro feature

- AI Find Time

### Not required for first public beta

- Gmail scanning
- Outlook email scanning
- Widgets
- Web app
- Collaboration
- Notion-style editor
- Complex automation

---

# 30. Product Metrics

Track product value, not vanity metrics.

## Activation

- % who create first task
- % who create first event
- % who connect calendar
- Time to first useful action

## Retention

- DAU/WAU
- Days opened per week
- Tasks completed per active user
- Events viewed/created
- Week-4 retention

## AI value

- Find Time requests/user
- % with at least one valid slot
- Suggestion acceptance rate
- Manual modification after acceptance
- Number of reschedules
- AI feature retention

## Subscription

- Trial start rate
- Trial → paid conversion
- Monthly/annual mix
- Churn
- AI usage among paid users

---

# 31. Final Recommendation

Build the product in this order:

```text
Beautiful task capture
        ↓
Reliable internal calendar
        ↓
Excellent Today experience
        ↓
Google Calendar sync
        ↓
Microsoft Calendar sync
        ↓
Deterministic availability engine
        ↓
AI Find Time (paid)
        ↓
Email intelligence
        ↓
Widgets / advanced productivity
```

The biggest mistake would be starting with the most exciting feature — AI — before calendar state, sync, recurrence, time zones, and task duration are reliable.

The strongest product foundation is a **fast, trustworthy planning system first** and an **AI scheduling layer second**.

---

# 32. Research Notes & Official Sources

The following sources were reviewed while preparing this plan.

## Google

- Google Calendar incremental synchronization:  
  https://developers.google.com/workspace/calendar/api/guides/sync
- Google Calendar push notifications:  
  https://developers.google.com/workspace/calendar/api/guides/push
- Google Calendar OAuth scopes:  
  https://developers.google.com/workspace/calendar/api/auth
- Gmail push notifications / `users.watch`:  
  https://developers.google.com/workspace/gmail/api/guides/push
- Gmail OAuth scopes and verification classification:  
  https://developers.google.com/workspace/gmail/api/auth/scopes

## Microsoft

- Microsoft Graph event delta:  
  https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0
- Microsoft Graph webhook change notifications:  
  https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks
- Microsoft Graph lifecycle notifications:  
  https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events
- Microsoft Graph message delta:  
  https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0
- Microsoft Graph permissions reference:  
  https://learn.microsoft.com/en-us/graph/permissions-reference

## Supabase

- Expo React Native quickstart:  
  https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native
- Row Level Security:  
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Vault:  
  https://supabase.com/docs/guides/database/vault
- Edge Functions:  
  https://supabase.com/docs/guides/functions
- Cron:  
  https://supabase.com/docs/guides/cron

## Expo / React Native

- Expo Router:  
  https://docs.expo.dev/router/introduction/
- Development builds:  
  https://docs.expo.dev/develop/development-builds/introduction/
- Expo Calendar:  
  https://docs.expo.dev/versions/latest/sdk/calendar/
- Expo push notifications:  
  https://docs.expo.dev/push-notifications/overview/

## Apple

- EventKit calendar access:  
  https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui
- Copilot Money App Store listing / Editors' Choice:  
  https://apps.apple.com/us/app/copilot-track-budget-money/id1447330651

## Subscriptions

- RevenueCat React Native:  
  https://www.revenuecat.com/docs/getting-started/installation/reactnative

## AI

- OpenAI Responses API reference:  
  https://developers.openai.com/api/reference/cli/resources/responses/methods/create
- OpenAI Structured Outputs overview:  
  https://openai.com/index/introducing-structured-outputs-in-the-api/

---

# 33. Next Planning Documents to Create

The core repository documents below now exist and are maintained alongside the
implementation. The current sprint handoff is `docs/sprint-6-active.md`;
`docs/sprint-5-active.md` retains Sprint 5 external-verification evidence.

1. `docs/database.md` — exact tables, indexes, constraints, RLS policies.
2. `docs/design-system.md` — exact visual tokens and reusable UI component rules.
3. `docs/sync-engine.md` — complete Google/Microsoft sync state machine.
4. `docs/ai-scheduling.md` — deterministic slot algorithm + AI function schemas.
5. `AGENTS.md` — engineering and architecture rules for repository development.
6. `README.md` — setup instructions so either developer can clone and run the app quickly.

They are reference documents, not a replacement for the live sprint handoff or
for the code when the two disagree.
