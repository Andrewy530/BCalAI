# Calendar views

How the calendar renders, and why it is split the way it is.

## One window, four views

`useCalendarWindow` is the single source of drawable data. It:

1. Computes the window the current view needs (`utils/window.ts`).
2. Fetches the events overlapping it.
3. Expands recurring events into occurrences.
4. Filters hidden calendars.
5. Buckets occurrences by local date key.

The day, week, month, and agenda views all consume that same result. None of
them fetches, expands, or filters on its own — a view that did would drift from
the others the first time a rule changed.

## Why occurrences, not events

A recurring event is **one row** in `events` with an RRULE. It is never stored
expanded. The window read therefore cannot filter recurring events by start
time — a weekly series that began last year still has occurrences this week —
so `fetchEventsInWindow` pulls master rows for any event with a recurrence rule
and lets `expandOccurrences` decide what actually lands in range.

Each occurrence gets a key of `<eventId>:<occurrenceIndex>`. Using the event id
alone would collapse a whole series into one item.

## Time zones

Occurrences are generated as **wall-clock date parts in the event's own zone**
and converted to instants afterwards. This is the property that keeps a 09:00
standup at 09:00 across a DST change rather than sliding to 08:00 or 10:00.

Day bucketing steps in local days via `addZonedDays`, never by adding
86,400,000 ms — a fixed-millisecond step drifts across a DST boundary and can
skip or repeat a day.

## Layout

Overlap layout is pure geometry in `@cal/domain`
(`layoutOverlappingEvents`): it takes intervals and returns fractional
left/width offsets. Views multiply by their own pixel dimensions. Each day
column runs its own layout pass, so a busy Tuesday cannot squeeze Wednesday.

## What each view is for

| View | Question it answers | Detail shown |
| --- | --- | --- |
| Day | What does today look like hour by hour? | Full timeline, now indicator |
| Week | Where is my free time this week? | Seven columns, compact chips |
| Month | How busy am I? | Coloured dots per calendar, not titles |
| Agenda | What is coming up? | Chronological list, empty days skipped |

Month deliberately shows dots rather than titles. At that density a title is
unreadable, and pretending otherwise costs the whole grid its legibility.
Tapping a day drops into the day view for the detail.

## Recurrence support

`parseRRule` implements a deliberate subset: FREQ, INTERVAL, COUNT, UNTIL,
BYDAY (weekly), BYMONTHDAY (monthly). Anything else returns `null`, and the
event is drawn as a single occurrence.

That is a safety property, not a limitation to fix casually. Silently dropping
an unsupported part such as `BYSETPOS` would generate occurrences that should
not exist, and a calendar that invents meetings is worse than one that misses a
repeat. Rules more exotic than the subset arrive only from Google or Microsoft,
which own their own expansion.

## Alerts

Event alerts and task reminders share `PlannedReminder` and are reconciled in
**one** pass by `useReminderSync`. They compete for the same capped OS queue,
and the reconcile cancels any pending notification it did not plan — so two
independent reconciles would each tear down the other's alerts on every run.

Keys are namespaced (`event:<id>:<index>:<minutes>` vs `task:<id>:<kind>`) so a
collision cannot cancel the wrong notification.
