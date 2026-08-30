# Notifications

How reminders are decided, scheduled, and handled. Sprint 1 covers local
notifications only; server-driven push arrives when there is behaviour the
device cannot compute on its own (a synced event changing while the app is
closed, for example).

---

## The split that matters

| Layer | Where | Responsibility |
| --- | --- | --- |
| Rules | `@cal/domain` → `tasks/reminders.ts` | *When* a reminder should fire. Pure, unit-tested, no platform imports. |
| Platform | `apps/mobile/src/lib/notifications/` | *How* to talk to the OS: permission, schedule, cancel, read pending. |
| Orchestration | `apps/mobile/src/features/notifications/` | Wiring the two together and reacting to taps. |

The rules layer never imports `expo-notifications`, which is why DST behaviour,
lead times, and the "never schedule into the past" guarantee can be tested in
milliseconds with no simulator.

---

## What gets a reminder

At most **one** reminder per task. A second notification for the same item is
noise, and the Today screen already provides the daily overview.

| Task shape | Reminder | Key |
| --- | --- | --- |
| Due date **with** a time | `minutesBefore` ahead of the due time (default 10) | `task:<id>:due` |
| Due date, **no** time | Morning of the due day, at `allDayMinute` (default 09:00 local) | `task:<id>:allday` |
| No due date | None | — |
| Completed or archived | None | — |

Two rules apply to every case:

- **Never schedule into the past.** The OS would either drop it or fire it
  immediately, and an alert for something already overdue is pure irritation.
- **Fire times are computed in the user's planning zone**, not the device's, so
  a trip does not move every morning reminder.

---

## Reconciliation, not rebuilding

`useTaskReminders` diffs the desired set against what is actually pending:

```text
tasks (TanStack Query)
      ↓
planReminders(tasks, { now, timeZone, preferences })
      ↓
capReminders(…)                    ← iOS allows 64 pending; we keep 48
      ↓
diffReminders(planned, scheduled)  ← scheduled read back from the OS
      ↓
cancel N, schedule M               ← proportional to what actually changed
```

Rebuilding the whole queue on every change would burn the OS budget and cause
visible flicker in Notification Centre. The diff ignores sub-second drift so a
plain refetch does not churn anything.

The reconcile runs when the task list changes and again on app foreground —
time passes while the app is closed, and past reminders need to fall away.
A ref serialises the two so they cannot interleave and double-schedule.

**Identifiers are our own keys**, not OS-generated ones. That is what makes
`scheduleReminder` idempotent: it cancels the key first, so re-running the sync
can never leave two notifications for one task.

---

## Permission

Asked from a deliberate user action in **Settings → Reminders**, never on first
launch. Requesting on launch is the fastest route to a permanent "no", and iOS
gives you exactly one prompt.

`getPermissionState()` collapses the platform's several states into three:

- `granted` — schedule freely.
- `undetermined` — we may still ask.
- `denied` — we may not; the card offers `Linking.openSettings()` instead.

The reconcile checks permission every run and quietly does nothing without it.

---

## Actions on a reminder

Registered once at startup as the `task-reminder` category:

| Action | Behaviour | Opens the app |
| --- | --- | --- |
| Tap the body | Deep-links to the task in the inbox | Yes |
| **Mark done** | Completes the task in place | No |
| **Snooze 1 hour** | Moves the due time forward an hour | No |

Deep links carry `taskId` as a route parameter. `useOpenTaskFromParam` opens the
editor and then clears the parameter — without clearing, navigating away and
back would pop the editor open again.

---

## Preferences

Stored per device in `AsyncStorage` under `reminder-preferences.v1`, not on the
profile. Notifications are scheduled *on this device*, so "10 minutes before" on
a phone and on a future tablet are legitimately different answers. Stored values
are merged over the defaults on read, so a newly added preference gets its
default rather than arriving as `undefined`.

Server-side push, when it lands, will need its own account-level setting.

---

## Testing

`packages/domain/src/tasks/reminders.test.ts` covers the rules: lead times, the
09:00 local morning slot either side of a DST boundary, past-time suppression,
the preference switches, diffing, and the 48-reminder cap.

The platform layer is deliberately thin and is exercised on a device — there is
no value in mocking `expo-notifications` to assert that it was called.

---

## Not yet built

- Event alerts (`events.alerts` already exists in the schema) — Sprint 2.
- Server push for changes arriving while the app is closed — Sprint 4+.
- Badge counts. Deliberately off: a permanent red dot on a planning app trains
  people to ignore it.
