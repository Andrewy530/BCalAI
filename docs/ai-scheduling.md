# AI scheduling

Status: **engine built and unit-tested; model layer designed, not yet built.**
The engine is `packages/domain/src/scheduling/availability.ts`. Sprint 6 adds
the server endpoint and the proposal UI.

## The division of labour

```
Task
  ↓  normalise constraints                       (deterministic)
Fetch calendar events + working hours            (deterministic)
  ↓
Free-slot engine                                 (deterministic)
  ↓  candidate slots — every one is genuinely free
AI ranking / intent interpretation               (model)
  ↓  ordered slot ids + reasons
Structured proposal
  ↓
User confirmation                                (always, in v1)
  ↓
Create time block
```

The engine guarantees: no overlap, correct time maths across DST, buffers
honoured, working hours respected, deadline met. The model handles what code
cannot: *"I focus better in the morning"*, *"not right after my class"*,
*"gym before dinner"*.

## The engine

`generateCandidateSlots({ constraints, busy })`:

1. Expand per-weekday working hours into UTC intervals covering the window.
   Windows are interpreted as local wall-clock time, so 09:00 stays 09:00 across
   a DST boundary.
2. Clip to any earliest/latest local minute band.
3. Subtract busy intervals, each grown by `bufferMinutes` on both sides.
4. Emit every placement of `durationMinutes` on the granularity grid, aligned to
   local clock time so proposals land on 10:15, not 10:07.

`rankSlotsHeuristically` provides an explainable ordering used when the Pro tier
is unavailable, and as the baseline the model's ranking is sanity-checked
against.

Intervals are half-open `[start, end)`, so back-to-back meetings do not
"overlap" — which is what users expect.

## Model contract

Server tools are narrow and enumerated. The model never receives permission to
execute SQL:

```
get_task(task_id)
get_calendar_window(start, end)
get_available_slots(constraints)
rank_schedule_slots(task, slots, preferences)
create_time_block(task_id, slot_id)
reschedule_time_block(event_id, slot_id)
```

Output must satisfy `aiScheduleProposalSchema`:

```ts
{ suggestions: [{ slotId, rank, score, reason }] }
```

`slotId` must be one the engine generated in this request. A response referring
to any other id — or proposing a raw time — is rejected as `AI_INVALID_OUTPUT`.
That is the structural reason the model cannot put an appointment on top of an
existing meeting.

## Server-side gates

Before any model call, the Edge Function checks, in order:

1. `has_active_entitlement(user_id, 'pro')` — never a client-supplied flag.
2. Per-user rate limit against `ai_schedule_requests` (indexed for it).
3. Constraints parse against `scheduleConstraintsSchema`.

If the engine returns zero slots, no model call happens at all: the answer is
`AI_NO_VALID_SLOT`, and the UI offers to widen the window or relax the buffer.

## Privacy

The prompt carries times, durations, and the task title — not event
descriptions, attendees, locations, or anything from email. Calendar contents
are never logged.

## Autonomy

v1 proposes only. "Auto-schedule flexible tasks" is a later opt-in, and requires
an undo history before it ships.
