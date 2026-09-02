# AI scheduling

Status: **engine, deterministic server Find Time path, provider foundation,
Phase 3 proposal implementation, and Phase 4 confirmation path are built; full
verification is tracked in** [`sprint-6-active.md`](sprint-6-active.md). The
engine is `packages/domain/src/scheduling/availability.ts`.

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
Persisted suggestion ID confirmation             (always, in v1)
  ↓
Server revalidation against current state
  ↓
Atomic internal BCal event + task linkage
```

The engine guarantees: no overlap, correct time maths across DST, buffers
honoured, working hours respected, deadline met. The model ranks sanitized
candidates for preferences such as morning versus afternoon, earliest/latest,
deadline urgency, and avoiding a slot immediately next to busy time.
Entity-specific instructions such as _"after my class"_ are out of scope for
v1 because event titles/descriptions are not sent to the model.

## The engine

`generateCandidateSlots({ constraints, busy })`:

1. Expand per-weekday working hours into UTC intervals covering the window.
   Windows are interpreted as local wall-clock time, so 09:00 stays 09:00 across
   a DST boundary.
2. Clip to any earliest/latest local minute band.
3. Subtract busy intervals, each grown by `bufferMinutes` on both sides.
4. Emit every placement of `durationMinutes` on the granularity grid, aligned to
   local clock time so proposals land on 10:15, not 10:07.

`rankSlotsHeuristically` provides an explainable offline baseline/test oracle.
Find Time remains server-gated to Pro users, and v1 does not use heuristic
ranking as a production fallback for a failed model call.

Intervals are half-open `[start, end)`, so back-to-back meetings do not
"overlap" — which is what users expect.

## Model contract

The v1 provider seam is one narrow operation:

```text
rankCandidateSlots(sanitizedInput) -> AIScheduleProposal
```

The model receives no tools, database access, provider APIs, or event content.
It cannot create or reschedule anything. OpenAI is the first server-side
adapter, using the Responses API with `store: false`, strict JSON Schema
Structured Outputs, configurable low reasoning, and post-response Zod plus
candidate-set validation.

Output must satisfy `aiScheduleProposalSchema`:

```ts
{
  suggestions: [{ slotId, rank, score, reason }];
}
```

`slotId` must be one opaque request-scoped id the server mapped to an engine
candidate and persisted for this request. Duplicate/unknown ids, non-contiguous
ranks, extra fields, or raw timestamps are rejected as `AI_INVALID_OUTPUT`.
That is the structural reason the model cannot put an appointment on top of an
existing meeting.

## Server-side gates

After authentication and the Pro entitlement check, deterministic preparation
validates task ownership and scheduling input, loads events, and generates the
candidate set. A valid request then passes through the atomic server-side
attempt limit before any model call:

1. Atomic per-user limit of 10 claimed attempts per rolling 60 minutes
   (server-configurable).
2. The request is persisted as pending before the provider call.

If the engine returns zero slots, no model call happens at all: the answer is
persisted as a failed `AI_NO_VALID_SLOT` request and counts against the valid
attempt limit; the UI offers to widen the window or relax the buffer.

## Privacy

The model receives opaque candidate ids, candidate start/end and derived local
time features, task duration/priority/deadline, explicit preferences, and the
untrusted task title/optional note. It receives no raw calendar rows, event
titles/descriptions, attendees, locations, email content, OAuth data, or
provider credentials. Full prompts and provider bodies are neither persisted
nor logged.

## Sprint 6 v1 product boundary

- Whole-duration tasks only; deterministic split scheduling is deferred.
- The task estimate is required; a profile default is not silently substituted.
- The horizon ends at the task deadline (or a bounded explicit window), is
  capped at 14 days, and uses the profile timezone/working hours.
- Hidden calendars still block time. Recurrence and provider exceptions must be
  expanded in shared domain code before candidates are generated.
- Confirmation targets only the provisioned internal default BCal calendar in
  Sprint 6 v1. The client sends a persisted suggestion ID; the server reloads
  the request, suggestion, task, profile, default calendar, and current busy
  events, then reuses the deterministic availability engine to revalidate the
  exact persisted slot. The final transaction also expands the supported
  recurrence representation and provider exceptions while holding the
  per-user event-write lock, so a recurring occurrence cannot be missed in the
  revalidation/commit race. One transaction creates the internal event, links
  the task, marks the suggestion/request accepted, and stores the canonical
  event ID. A repeated confirmation returns that event and creates no duplicate.
  Empty events do not block without a buffer, matching interval normalization;
  a positive buffer grows an empty event into a point blocker. Pro is checked
  when the proposal is generated; Phase 4 intentionally grandfathered that
  persisted proposal through confirmation so it does not invent the Phase 5
  billing dependency.
- Provider-calendar targets are outside Sprint 6 v1. Any later provider target
  must use the existing provider-first write architecture.

## Autonomy

v1 proposes only. "Auto-schedule flexible tasks" is a later opt-in, and requires
an undo history before it ships.
