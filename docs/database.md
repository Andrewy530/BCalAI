# Database

Postgres via Supabase. Every table below is created by a migration in
`supabase/migrations/`; nothing is created by hand.

## Conventions

- Every user-owned table has `user_id uuid not null references auth.users`.
- Every user-owned table has RLS enabled and four explicit policies.
- A server-only table has RLS enabled and **no** policies.
- `updated_at` is maintained by the `set_updated_at` trigger, never by a client.
- Policies use `(select auth.uid())` so the planner evaluates it once per query
  rather than once per row.

## Tables

| Table                     | Purpose                             | Client access                |
| ------------------------- | ----------------------------------- | ---------------------------- |
| `profiles`                | Planning preferences, working hours | Own row, full CRUD           |
| `calendars`               | Internal and synced calendars       | Own rows, full CRUD          |
| `events`                  | Events and time blocks              | Own rows, full CRUD          |
| `task_lists`              | Lists / projects                    | Own rows, full CRUD          |
| `tasks`                   | Tasks and reminders                 | Own rows, full CRUD          |
| `tags`, `task_tags`       | Labelling                           | Own rows, via task ownership |
| `provider_accounts`       | Connected Google/Microsoft accounts | Read + delete only           |
| `calendar_sync_states`    | Sync cursors, webhook bookkeeping   | **None**                     |
| `sync_jobs`               | Durable retry queue                 | Read only                    |
| `ai_schedule_requests`    | Find Time requests                  | Read + update                |
| `ai_schedule_suggestions` | Ranked proposals                    | Read only                    |
| `subscriptions`           | RevenueCat entitlement mirror       | Read only                    |

## Invariants enforced in the database

These are constraints, not conventions, because application code is not the only
thing that writes to this database:

- `events.end_at >= events.start_at`.
- A user has at most one default calendar — a partial unique index on
  `(user_id) where is_default`.
- An internal calendar has no provider identity; a synced calendar must have a
  `provider_calendar_id`.
- A task with `has_due_time` must have a `due_at`.
- A `completed` task must have a `completed_at`, and a non-completed task
  must not.
- `(provider_account_id, provider_event_id)` is unique — this is the idempotency
  key that makes replayed webhook deliveries safe.

## Indexes that matter

| Index                                                     | Query it serves                                   |
| --------------------------------------------------------- | ------------------------------------------------- |
| `events (user_id, start_at, end_at)`                      | "everything in this window" — every calendar view |
| `events (sync_status) where pending/failed/conflict`      | the outbound push queue                           |
| `tasks (user_id) where open and flexible and unscheduled` | the Find Time queue                               |
| `calendar_sync_states (webhook_expires_at)`               | Cron webhook renewal                              |

## Automatic provisioning

Two triggers mean the app never has to handle a signed-in user with missing
setup:

1. `on_auth_user_created` → creates a `profiles` row.
2. `profiles_create_default_calendar` → creates a "Personal" default calendar.

## Types

Regenerate after every migration and commit the result — CI fails if it is
stale:

```bash
pnpm db:types
```

## Testing

`supabase/tests/` holds pgTAP tests run by `supabase test db` in CI. They cover
cross-user isolation, the server-only tables, and the constraints above. An RLS
mistake is silent in the app, which is exactly why it is gated in CI.
