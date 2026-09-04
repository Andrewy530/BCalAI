# Sprint 6 — AI Pro / Find Time

Status: PHASE 4 SAFE CONFIRMATION AND RECURRENCE HARDENING IMPLEMENTED,
VERIFIED, AND PUSHED — LIVE MODEL EVALUATION AND PHASE 5 REMAIN OUT OF SCOPE

This file is the source of truth for Sprint 6 implementation and handoff.

Any implementer continuing Sprint 6 must read this file, `AGENTS.md`, `docs/architecture.md`, `docs/ai-scheduling.md`, and the relevant implementation before making changes.

Update this document after every meaningful implementation slice and before every handoff.

---

## Sprint Goal

A paid user with an unscheduled task can tap **Find Time**, receive one or more safe scheduling proposals, choose one, confirm it, and have BCal create the corresponding time block.

AI may rank and explain deterministic candidate slots.

AI must never determine whether a time is actually available.

---

# Existing Foundation — Do Not Rebuild

The repository already contains:

- deterministic availability calculation in `packages/domain`
- candidate-slot generation
- heuristic slot ranking
- scheduling constraint schemas
- AI proposal/result schemas
- task duration/deadline fields
- profile timezone and working-hour preferences
- normalized event storage
- `ai_schedule_requests`
- `ai_schedule_suggestions`
- `subscriptions`
- server-authoritative `has_active_entitlement(...)`
- Supabase Edge Function infrastructure
- authenticated server helpers
- provider-first calendar-write architecture
- RLS and test infrastructure

Before implementing anything, verify the current implementation rather than duplicating these systems.

---

# Core Architecture

```text
User taps Find Time
        |
        v
Authenticated server endpoint
        |
        +--> verify task ownership
        |
        +--> verify Pro entitlement
        |
        +--> normalize task + preferences into ScheduleConstraints
        |
        v
Fetch relevant calendar events
        |
        v
Deterministic availability engine
        |
        v
Valid candidate slots
        |
        +--> zero slots -> apply rate limit, mark failed, return no-slot
        |
        +--> one or more slots -> apply atomic rate limit and persist pending
             request
        |
        v
AI provider adapter
        |
        v
Ranked candidate SLOT IDS only
        |
        v
Zod validation + server validation
        |
        v
Persist request + suggestions
        |
        v
Proposal UI
        |
        v
User selects + confirms
        |
        v
SERVER REVALIDATES SLOT
        |
    +---+---+
    |       |
  free    stale/conflict
    |       |
    v       v
schedule   reject + refresh
```

---

# Non-Negotiable Safety / Correctness Rules

1. Availability is deterministic.
2. AI never invents a timestamp.
3. AI output refers only to candidate slot IDs generated for the current request.
4. Every model output is validated with Zod.
5. Every returned slot ID is checked against the current candidate set.
6. The mobile client never receives an AI-provider API key.
7. The mobile client cannot grant itself Pro access.
8. Server verifies ownership and entitlement.
9. A proposal is never treated as a reservation.
10. Availability is rechecked immediately before confirmation.
11. Confirmation must be idempotent.
12. Provider-backed calendar writes remain provider-first.
13. User/calendar data sent to the AI must remain within the documented privacy boundary.
14. No event descriptions, attendee lists, locations, email content, OAuth tokens, or provider credentials are sent to the AI.
15. AI-provider failure must never corrupt calendar/task state.

---

# Phase 0 — Audit + Decisions

Status: COMPLETE (2026-09-01)

Goal: reconcile Sprint 6 with the current repository and freeze the implementation contracts before feature code begins.

## 0A. Repository audit

Inspect:

- `AGENTS.md`
- `calendar_app_product_technical_plan.md`
- `docs/architecture.md`
- `docs/database.md`
- `docs/ai-scheduling.md`
- current Sprint 5 tracker
- `packages/domain/src/scheduling/**`
- scheduling tests
- `packages/schemas/**`
- task schemas
- profile schemas
- database migrations related to AI/subscriptions
- current Edge Function architecture and shared helpers
- mobile task API/hooks/components/routes
- calendar/event creation flow
- provider-first write flow
- current dependency graph and verification scripts

Record any differences between documentation and implementation here before coding.

### Audit result at `33fc8d3`

The repository already has more deterministic scheduling foundation than the
older product-plan checklist implies, but it has no Sprint 6 endpoint, model
adapter, confirmation path, RevenueCat runtime integration, or mobile Find Time
feature.

What is present and should be reused:

- `packages/domain/src/scheduling/availability.ts` expands profile working
  hours in the user's timezone, handles DST, subtracts buffered half-open busy
  intervals, emits whole-duration candidates on a local-time grid, and provides
  heuristic ranking and conflict checks. Its focused tests cover working hours,
  DST, buffers, full-day booking, grid alignment, conflicts, and preference
  ranking.
- `packages/domain/src/recurrence/**` expands the supported RRULE subset. The
  mobile `expand-calendar-events.ts` additionally applies provider exceptions
  and Microsoft materialized occurrences.
- `@cal/schemas` already defines schedule constraints, AI request/proposal
  shapes, task duration/flexibility/deadline fields, profile timezone/working
  hours, and calendar/event shapes.
- The database provisions an internal `Personal` default calendar, indexes
  schedulable tasks, stores AI request/suggestion rows, mirrors subscription
  entitlements, and exposes the server-authoritative
  `has_active_entitlement(...)` function.
- Edge Functions consistently use `requireUser`, explicitly user-scoped
  service-role queries, `withErrorHandling`, Zod parsing, and stable application
  error envelopes. The provider event write path is synchronous and
  provider-first.
- Mobile routes are thin; tasks/events follow route -> screen -> hook -> API;
  server state uses TanStack Query. `queryKeys.subscription()` is reserved, but
  no subscription or AI scheduling feature implementation exists.

Differences and prerequisites discovered:

1. `generateCandidateSlots` does not implement splitting even though the
   constraint schema exposes `splittable` and `minSplitMinutes`. Those fields
   currently have no effect.
2. Candidate IDs are predictable request-local values such as `slot_1`; they
   are not persisted. The server boundary needs request-scoped opaque IDs and
   must persist the exact candidate identity/timestamps used for confirmation.
3. Recurring-event busy expansion is partly mobile-feature code. Phase 1 must
   extract/reuse a provider-neutral domain helper so the server does not ignore
   recurring occurrences or duplicate calendar logic.
4. `aiScheduleRequestSchema` currently permits a partial override of every
   engine field, including duration, working hours, timezone, granularity, and
   split flags. The production request must expose a narrow allowlist and keep
   task/profile-derived fields server-authoritative.
5. `scheduleConstraintsSchema` validates only that the window is ordered. It
   uses a nonempty timezone string instead of the repository timezone schema
   and does not reject an inverted earliest/latest minute band.
6. `aiScheduleProposalSchema` constrains individual suggestions but does not
   enforce unique slot IDs, unique/contiguous ranks, or cross-check membership
   in the current candidate set. Those remain mandatory server checks.
7. Existing AI persistence lacks provider/model/latency/token/candidate-count
   metadata, a persisted slot ID, target calendar, task-version snapshot,
   confirmation idempotency state, and accepted event linkage. Suggestions
   persist raw timestamps but cannot prove which generated candidate they came
   from.
8. Authenticated users currently have broad UPDATE permission on their own
   `ai_schedule_requests` rows. That lets a client rewrite server-owned status,
   constraints, task ID, and error fields. A forward migration must make these
   records server-managed; do not edit migration `0005`.
9. The subscription mirror has the entitlement check needed for the gate, but
   it lacks RevenueCat event IDs/timestamps needed for replay and out-of-order
   webhook handling. RevenueCat SDK/webhook code is absent.
10. `@cal/types` includes `AI_NO_VALID_SLOT`, `AI_RATE_LIMITED`, and
    `AI_INVALID_OUTPUT`, while the Edge Function error union is missing two of
    them and has no stable timeout/provider-unavailable code. The shared lists
    must be reconciled before the endpoint ships.
11. The Deno import map currently exposes Supabase and Zod only. Phase 1 must
    establish a checked import path to `@cal/domain`/`@cal/schemas`; copying the
    availability engine under `_shared` is not acceptable.
12. The current calendar query/expansion correctly treats hidden calendars as
    a presentation choice. Find Time must consider every owned, non-cancelled
    event, including recurring occurrences and all-day events, regardless of
    visibility.
13. The older AI document describes a model tool suite and says heuristic
    ranking is used when Pro is unavailable. Sprint 6 v1 uses one narrow rank
    call, no model tools, and always requires server-verified Pro entitlement.
14. The older natural-language example "after my class" cannot be honored
    inside the approved privacy boundary because event titles/descriptions are
    not sent to the model. Entity-specific event semantics are deferred.
15. The aggregate `pnpm verify` script covers formatting, lint, six workspace
    typechecks, and package tests. Deno checks/tests and Supabase reset/pgTAP are
    separate CI/manual gates and must be run for the phases that touch them.

## 0B. AI provider decision

Initial provider:

- Provider: OpenAI
- API: Responses API
- Initial model candidate: `gpt-5.6-luna`
- Initial reasoning effort candidate: `low`
- Alternate evaluation model: `gpt-5.6-terra`

Implementation must use a server-side provider abstraction.

Suggested configuration:

```text
AI_PROVIDER=openai
AI_MODEL=gpt-5.6-luna
AI_REASONING_EFFORT=low
OPENAI_API_KEY=<Supabase secret>
```

Do not expose any of these through Expo public environment variables.

### Required model evaluation

Before production model choice is declared final, run representative fixtures against Luna and Terra.

Evaluate:

- schema-valid response rate
- correct slot-ID ranking
- following morning/afternoon/evening preferences
- deadline urgency
- buffer preferences
- malformed/adversarial user notes
- invented slot resistance
- irrelevant instructions embedded in user-controlled text
- latency
- token usage
- estimated cost

If Luna performs reliably, use Luna.

If Luna fails materially more often on realistic cases, compare Terra.

Do not use Sol by default unless evaluation demonstrates that the narrower models are inadequate.

### Phase 0 provider/API conclusion

- Keep OpenAI behind `rankCandidateSlots(input) -> AIScheduleProposal`.
- Use the Responses API with `store: false`, no tools, strict JSON Schema
  Structured Outputs, `reasoning.effort` from server configuration, and a small
  output-token cap. Parse the returned JSON with the repository Zod schema and
  then run all cross-field/candidate-set checks.
- Both named candidates currently support the Responses API, Structured
  Outputs, and `low` reasoning. Official model documentation describes Luna as
  the cost-sensitive/high-volume tier and Terra as the balanced tier. This
  validates the proposed comparison but does not select a winner without the
  repository fixtures.
- Configuration is server-only:
  `AI_PROVIDER`, `AI_MODEL`, `AI_REASONING_EFFORT`, `AI_TIMEOUT_MS`, and
  `OPENAI_API_KEY`. No AI setting receives an `EXPO_PUBLIC_` prefix.
- One transient retry is allowed for network failures, 408, 429, and 5xx only,
  within a 20-second total deadline. Schema/validation failures and other 4xx
  responses are not retried.
- There is no automatic cross-provider or heuristic production fallback in
  v1. Entitled users receive a controlled provider-unavailable error; the
  heuristic ranker remains an offline baseline/test oracle.

Official references checked during Phase 0:

- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/models/gpt-5.6-terra
- https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create

### Luna-vs-Terra evaluation design

The Phase 2 harness will keep deterministic fixtures in source control and
place the live runner behind an explicit environment flag/API key. It will:

1. Generate the same candidate set once per fixture, then send identical
   sanitized inputs to `gpt-5.6-luna` and `gpt-5.6-terra` at `low` reasoning.
2. Use opaque, nonordinal candidate IDs. Run every fixture five times per model
   so schema/safety reliability is measured rather than inferred from one run.
3. Cover earliest, latest, morning, afternoon, evening, deadline urgency,
   equally valid choices, crowded calendars, long tasks, adjacency/buffer
   preference, hostile task title/note, irrelevant embedded instructions,
   unknown-ID bait, duplicate-ID bait, and zero candidates.
4. Grade mechanically before any qualitative review: completed response,
   strict-schema parse, known unique IDs only, contiguous unique ranks,
   score/reason limits, suggestion cap, and zero timestamps/extra fields.
5. Grade fixture invariants (preferred band, deadline urgency, expected
   top-choice set) rather than requiring one brittle exact ordering where
   several slots are equivalent.
6. Record model ID, prompt/schema version, latency, input/output/reasoning
   tokens, estimated cost using the price snapshot at run time, refusal/error
   class, and all grader results. Do not store full prompts or user data.

Selection gate: both models must have a 100% unknown/invented-slot rejection
rate after server validation. Luna becomes the production default only if its
schema-valid rate is at least 99%, it passes every safety fixture, and its
preference/urgency score is within five percentage points of Terra. Otherwise
use Terra and record the failing Luna cases. Latency and cost break a quality
tie; Sol is outside the default comparison.

## 0C. Product decisions that must be explicit

Resolve and record:

### Target calendar

Frozen Sprint 6 v1 decision: an accepted Find Time block is created only in
the user's provisioned `is_default = true`, `source_type = 'internal'` BCal
calendar. The server rejects a missing, replaced, or read-only default rather
than selecting another calendar. Selected calendars and provider-backed target
calendars are outside Sprint 6 v1; a later provider target must preserve the
provider-first write architecture.

### Splittable tasks

The schema contains splittable-task concepts, while the existing candidate generator primarily produces whole-duration slots.

Decision for Sprint 6 v1:

Prefer whole, non-split task scheduling unless deterministic split scheduling is explicitly implemented and tested.

AI must never invent task splitting.

### Natural-language context

The AI documentation allows intent such as preferences around existing commitments, while the privacy boundary excludes event descriptions/titles.

Do not solve this by silently exposing event content.

For v1, support preferences expressible from sanitized scheduling data, for example:

- morning
- afternoon
- evening
- earliest valid option
- latest valid option
- avoid immediately before/after busy periods
- user-supplied explicit time constraints

Entity-specific instructions such as “after my chemistry class” require a separately approved privacy/context design.

### Free vs Pro behavior

Find Time is a Pro feature.

The deterministic heuristic ranker may remain:

- a test oracle/baseline, and/or
- a controlled server fallback for entitled users if explicitly desired.

It must not accidentally bypass the Pro product gate.

### Rate limit

Define:

- request count
- time window
- response when exceeded
- whether failed model calls count
- tests

Keep the limit server-side and configurable.

### AI data retention / observability

Record what is stored for each request:

- user/request ID
- model/provider
- timing
- success/failure
- token usage if available
- error code
- candidate count
- accepted suggestion

Avoid storing full prompts unless explicitly required.

## 0D. Frozen Sprint 6 v1 contracts

### Target and task qualification

- Accepted blocks go to the user's `is_default = true`, `source_type =
'internal'` BCal calendar. Provider-backed targets and calendar selection are
  deferred. If that internal default is missing, the server returns a stable
  configuration error and never falls back to the first calendar.
- A schedulable task is owned by the caller, `status = 'open'`, flexible,
  unscheduled, and has `estimated_minutes`. Duration is taken from the task;
  the profile default does not silently replace a missing estimate.
- The task must have a future due date/time or the request must provide a
  bounded `windowEnd`. Date-only due dates mean the end of that local day;
  timed due dates are exact. The horizon is capped at 14 days, starts no earlier
  than now, and never extends past the task deadline.
- V1 schedules one whole block. A true split request is rejected as unsupported
  rather than ignored.

### Request and deterministic input

- Replace the broad partial-constraints API with a strict request allowlist:
  task ID, optional 500-character note, optional bounded window start/end,
  buffer minutes, earliest/latest local minute, and preferred time of day.
- Duration, timezone, working hours, granularity, flexibility, ownership, and
  entitlement are resolved by the server. V1 granularity is 15 minutes.
- All owned, non-cancelled events block time whether their calendars are visible
  or hidden. Recurrence and provider exceptions are expanded deterministically.
  No event title, description, location, attendee, or provider credential is
  needed by the model.
- The engine may generate all valid slots. Before the model call, a
  deterministic diversity-preserving shortlist caps model input at 40 slots;
  request-scoped opaque IDs map back to exact server-persisted timestamps.

### AI privacy boundary

The model receives only opaque candidate IDs with start/end/local-time derived
features, task duration/priority/deadline, explicit preference fields, and the
untrusted task title/note. It receives no raw calendar rows or event content.
User-controlled strings are delimited as data and can influence ranking/reason
text only; they cannot change constraints, candidate membership, or tools
because the adapter exposes no tools.

Entity-specific language such as "after chemistry" is unsupported in v1.
Structured morning/afternoon/evening, earliest/latest, deadline urgency, and
adjacency preferences are supported. Reasons must not claim knowledge of an
event's identity.

### Entitlement, rate limit, and failure policy

- Find Time is Pro-only. The server calls
  `has_active_entitlement(user_id, 'pro')`; client RevenueCat state is UI only.
- Limit accepted proposal attempts to 10 per rolling 60 minutes per user,
  configurable server-side. Enforce check-and-record atomically. Invalid auth,
  ownership, task, or input attempts do not count. No-slot and provider-failed
  requests do count; a rejected 11th request does not create another row.
- Rate limiting returns HTTP 429 + `AI_RATE_LIMITED`. A no-slot request persists
  a failed request with `AI_NO_VALID_SLOT`, returns the controlled no-slot
  response, and makes zero model calls.
- Model timeout/outage never falls back to free-user behavior and never changes
  task/calendar state.

### Persistence, observability, and retention

Forward migrations will make AI request/suggestion rows server-managed and add
the minimum fields needed for exact replay-safe confirmation: opaque slot ID,
task/profile/target-calendar versions, target calendar, accepted event,
provider/model/prompt version, candidate count, latency, token counts, and
stable error class. Full prompts, full provider responses, task descriptions,
event content, and secrets are not stored or logged. OpenAI requests use
`store: false`.

Operational request/suggestion detail expires after 30 days; accepted task and
event rows remain canonical product data. Aggregate metrics may be retained
without task text, note text, timestamps, or calendar content. Account deletion
continues to cascade all user-linked operational rows.

### Confirmation and idempotency

The client confirms a persisted suggestion ID, never arbitrary timestamps. The
server reloads the request/suggestion with an explicit user scope, verifies
ownership, and handles an already accepted suggestion by returning its stored
canonical event without revalidation or another insert.

For a proposed suggestion, the server verifies the current task is still open,
flexible, and unscheduled; the internal default calendar is still the same
non-read-only calendar; and the task/profile/calendar versions match the
persisted snapshot. It rebuilds the persisted constraints with the shared
deterministic availability engine over current events and requires the exact
persisted start/end pair to remain a generated free candidate. A changed task
or relevant profile/calendar input, a deleted/replaced default calendar, or a
newly conflicting event returns `AI_PROPOSAL_STALE` and creates nothing.

One server-authoritative database transaction, serialized per user, rechecks
the request/suggestion/task/calendar snapshots and conflicts, creates exactly
one internal event, links `tasks.scheduled_event_id`, sets the task to
`scheduled`, marks the suggestion accepted, marks the request accepted, and
stores the canonical event ID. If any write fails, the transaction rolls back
the event, task link, and acceptance state together. Repeating confirmation of
the same accepted suggestion returns the same canonical event; it never creates
a duplicate. Confirming a different suggestion from an already accepted
request is stale. Provider-first confirmation is not part of Sprint 6 v1.

---

# Phase 1 — Deterministic Server Find-Time Path

Status: IMPLEMENTED AND VERIFIED (2026-09-01; included in `4678adc`)

Goal: complete the entire scheduling path up to the AI boundary without making a model request.

Build or finalize the server-side flow:

1. Authenticate request.
2. Parse input with Zod.
3. Load task.
4. Verify task ownership.
5. Require a schedulable task.
6. Resolve duration.
7. Resolve deadline/horizon.
8. Load profile timezone.
9. Load working hours.
10. Apply supported user overrides.
11. Determine relevant query window.
12. Load blocking calendar events.
13. Normalize constraints.
14. Call existing candidate generator.
15. Return deterministic candidate slots.

No AI call in this phase.

## Required cases

Test:

- missing task
- task owned by another user
- completed task
- already-scheduled task
- missing duration
- invalid duration
- deadline already passed
- no available time
- fully booked day
- adjacent events
- event buffers
- working-hour boundaries
- scheduling horizon
- preferred time of day
- timezone conversion
- DST transition
- malformed constraints

## Exit criteria

- deterministic server flow works without AI
- no scheduling engine duplication
- targeted tests pass
- Deno checks/tests pass for touched Edge Functions
- aggregate verification passes, or an infrastructure-only blocker is recorded
- tracker updated
- coherent checkpoint is ready for commit/push

Record checkpoint SHA:

`4678adc381cd0e85326772a5e7d6864af9589a1c`

---

# Phase 2 — AI Provider Abstraction + Evaluation Harness

Status: FOUNDATION IMPLEMENTED; LIVE EVALUATION PENDING (2026-09-02)

Goal: add AI ranking without coupling scheduling logic to one vendor.

Create a narrow provider interface conceptually equivalent to:

```text
rankCandidateSlots(input) -> AIScheduleProposal
```

Provider receives only approved/sanitized scheduling context.

Provider does not:

- query Supabase
- read calendars
- choose arbitrary timestamps
- create events
- modify tasks
- determine entitlement

## OpenAI adapter

Implement the first adapter with OpenAI Responses API.

Requirements:

- model chosen by server configuration
- reasoning effort configurable
- Structured Outputs / JSON schema
- existing proposal schema reused where possible
- timeout
- controlled retry policy for transient failures
- provider errors mapped to stable application error codes
- token/model metadata captured where appropriate

## Output validation

Validation sequence:

1. API-level structured output.
2. Parse with repository Zod schema.
3. Reject duplicate slot IDs.
4. Reject unknown slot IDs.
5. Reject missing candidate references.
6. Reject invalid ranking.
7. Reject invalid score.
8. Reject excessive suggestions.
9. Reject unexpected timestamps or provider-generated schedule data.

## Evaluation fixtures

Create deterministic representative inputs.

At minimum:

- obvious earliest slot
- preferred morning
- preferred afternoon
- deadline-sensitive task
- several equally valid slots
- crowded calendar
- long-duration task
- user note containing irrelevant instructions
- user note attempting to override model/system constraints
- candidate IDs designed to discourage guessing
- no candidates

Run evaluation against:

- `gpt-5.6-luna`
- `gpt-5.6-terra`

Record result summary here.

### Evaluation result

The provider abstraction, strict OpenAI Responses adapter, offline fixtures,
and fixture grader are implemented in checkpoint `4678adc`. The live Luna /
Terra comparison has not run because it requires an authorized server-side
`OPENAI_API_KEY` and explicit cost authorization. No production model is
selected yet.

### Selected production default

TBD pending the live Luna / Terra comparison.

## Exit criteria

- provider abstraction exists
- OpenAI adapter works
- model can only select supplied candidates
- malformed output tests pass
- evaluation recorded
- provider choice recorded
- `pnpm verify` passes
- checkpoint pushed

Checkpoint SHA:

`4678adc381cd0e85326772a5e7d6864af9589a1c` (foundation checkpoint; subsequent
Phase 3 implementation is recorded below)

---

# Phase 3 — Production `ai-find-time` Endpoint

Status: IMPLEMENTATION AND LOCAL VERIFICATION COMPLETE; CHECKPOINT PUSHED
(2026-09-02)

Goal: create the complete proposal-generation request.

Expected function:

`supabase/functions/ai-find-time/`

Exact placement may change after architecture audit.

Flow:

1. Authenticate.
2. Validate request.
3. Check `has_active_entitlement(user_id, 'pro')`.
4. Verify task ownership, normalize constraints, and generate deterministic
   candidates.
5. Enforce the atomic rate limit and create the pending request.
6. If zero candidates:
   - persist/return controlled no-slot result
   - make zero AI requests.
7. Call configured AI adapter.
8. Validate structured result.
9. Cross-check every proposed slot.
10. Persist suggestions.
11. Mark the request proposed and return it.

## Failure behavior

Cover:

- unauthenticated
- non-Pro
- rate limited
- invalid task
- no valid slots
- AI timeout
- provider 4xx
- provider 5xx
- invalid structured output
- unknown slot ID
- duplicated slot ID
- request persistence failure

No failure may partially schedule a task.

## Exit criteria

- full proposal endpoint works
- server entitlement cannot be bypassed
- no-slot flow avoids model cost
- AI request/suggestion persistence works
- RLS behavior verified
- targeted integration tests pass
- `pnpm verify` passes
- checkpoint pushed

Checkpoint SHA:

`3950c77f28420e7cdfb2c7a9450c96c754661a9a`

---

# Phase 4 — Safe Confirmation / Scheduling

Status: DOCUMENTATION RECONCILED; REVIEW HARDENING AND RECURRENCE
VERIFIED; CHECKPOINTS PUSHED AND CI GREEN (2026-09-03)

Goal: convert a proposal into a real scheduled block safely.

Create a server-authoritative confirmation path for the frozen v1 target:
the user's provisioned internal default BCal calendar. The client sends only the
persisted suggestion ID; it never supplies trusted timestamps, a calendar ID,
or task state.

Confirmation contract:

1. Authenticate with `requireUser` and parse a strict suggestion-ID request.
2. Load the suggestion and its request under the authenticated user's explicit
   scope. Cross-user or missing rows are indistinguishable and return not found.
3. If that exact suggestion is already accepted, load and return its stored
   canonical event. This path performs no second insert.
4. For a proposed request, load the current task, profile, internal default
   calendar, and all current blocking events.
5. Verify the task is still open, flexible, unscheduled, owned by the caller,
   and has the same persisted task version.
6. Verify the same internal default calendar is still present, writable, and
   has the same persisted calendar version. Verify the profile version and
   relevant scheduling inputs are unchanged.
7. Reconstruct the persisted constraints and run the shared deterministic
   availability engine against current events. The exact persisted start/end
   pair must still be one of the generated candidates.
8. Call one server-only, transactional confirmation operation that repeats the
   state/conflict checks while holding the per-user confirmation/write lock.
9. In that transaction, create exactly one internal event, link
   `tasks.scheduled_event_id`, set the task to `scheduled`, mark the suggestion
   accepted, mark the request accepted, and store the canonical event ID.
10. Return the canonical event and the linked task state.

## Race-condition rules

Proposal != reservation.

If availability changed:

- do not create overlapping event
- return `AI_PROPOSAL_STALE` with HTTP 409
- allow client to request fresh proposals

The transactional operation also rechecks task/profile/calendar versions and
the exact current recurrence-aware event conflicts after the Edge Function's
deterministic revalidation. Event inserts and updates that can introduce or
change a blocking interval participate in the same per-user lock, so a newly
committed conflicting event cannot pass the final check concurrently.

### Recurrence race finding and hardening

The Phase 4 review found a real gap in the previous final SQL predicate: it
compared only the raw `events.start_at`/`end_at` pair. A recurring master can
start outside the proposed interval while one of its generated occurrences is
inside it, so a recurring event created or changed between Edge Function
revalidation and the transaction could be missed.

The root cause was a mismatch between the shared domain recurrence expansion
and the database transaction's raw-row overlap check. The hardening migration
adds a server-only, recurrence-aware SQL predicate for the repository's
supported RRULE subset. It expands daily/weekly/monthly/yearly master
occurrences in the event timezone, applies Google-style moved/cancelled
exceptions, respects Microsoft materialized instances, and checks the
effective occurrence against the buffered proposed interval. Unsupported or
malformed recurrence data fails closed. The existing per-user advisory event
write lock remains in force, so inserts/updates that could introduce an
occurrence cannot commit between the final recurrence-aware read and the
confirmation event insert. The domain engine remains the availability
authority; this SQL function is only the final atomic safety boundary.

The final predicate also aligns zero-duration semantics with the deterministic
engine: an empty event is ignored with no buffer because interval normalization
drops it; with a positive buffer, it blocks the point grown by that buffer.

Entitlement is intentionally not rechecked during confirmation. Phase 4
already requires an authoritative Pro check when the proposal is generated;
an already-persisted proposal is grandfathered through confirmation if the
entitlement later expires. This completes an authorized, user-confirmed action
without inventing a Phase 5 RevenueCat dependency, and accepted retries remain
pure idempotent reads. A future billing decision can change this only as an
explicit product decision.

## Stale-proposal behavior

Return `AI_PROPOSAL_STALE` and leave all confirmation state unchanged when:

- the task was edited, deleted, completed, made non-flexible, or scheduled;
- the profile timezone or working hours changed, or its relevant version no
  longer matches the request snapshot;
- the internal default calendar was deleted, replaced, made read-only, or its
  state/version changed; or
- a current internal/provider event now occupies the proposed interval, after
  recurrence/exception expansion and buffers are applied.

No stale path may insert an event, link the task, or mark the AI request or
suggestion accepted.

## Idempotency

Protect against:

- double tap
- mobile retry
- duplicate network delivery
- repeated confirmation of same suggestion

Exactly one successful accepted suggestion produces exactly one scheduled block.
Repeated confirmation of that same accepted suggestion returns the stored
canonical event ID and event, even when the request is retried after a response
boundary. A different unaccepted suggestion from an already accepted request is
stale. The database also enforces one accepted suggestion per request and one
canonical accepted event reference.

## Failure atomicity

Event insertion, task linkage/status, suggestion acceptance, request
acceptance, and canonical event-ID persistence are one database transaction.
Any expected or unexpected failure after the transaction begins rolls back all
of them. A failed confirmation must not leave an event without a linked task,
a scheduled task without that event, or accepted AI state without the canonical
event. Provider-first mutation is not used because provider calendars are out
of scope for Sprint 6 v1.

## Phase 4 verification requirements

Before the Phase 4 checkpoint, run every applicable repository and database
gate and record the exact result:

```text
pnpm verify
(cd supabase/functions && deno task check)
(cd supabase/functions && deno task test)
git diff --check
supabase db reset --yes
supabase test db
supabase gen types typescript --local | diff - packages/types/src/database.types.ts
GitHub CI for the pushed checkpoint — all applicable jobs green
```

The Deno commands run from `supabase/functions`, where the repository's Deno
task file lives. The generated-type command compares stdout directly with the
committed `packages/types/src/database.types.ts` file.

Focused confirmation coverage must include unauthenticated and cross-user
access, deleted/completed/already-scheduled tasks, valid confirmation, newly
occupied slots, changed task/profile/calendar inputs, repeated confirmation,
double/concurrent confirmation, and rollback after a failure during the
transaction. The recurrence hardening coverage additionally includes a master
whose occurrence overlaps while its raw row does not, a recurring event
created/changed after proposal persistence, moved and cancelled exceptions,
ordinary one-off overlap, adjacent non-overlap, zero-duration behavior, and
accepted-retry idempotency.

## Exit criteria

- persisted suggestion ID is the only confirmation input
- server ownership, task qualification, and current state are authoritative
- exact slot is revalidated through the shared deterministic engine
- stale/conflicting proposals create no event and return `AI_PROPOSAL_STALE`
- double/concurrent confirmation returns one canonical event
- task/event and request/suggestion acceptance linkage is correct
- failure atomicity is tested
- focused and full integration tests pass
- every applicable Phase 4 verification requirement above passes
- checkpoint pushed

Checkpoint SHA:

`222e7652ec948c63172728a478c36acde5b52096` (review hardening implementation;
formatting fix `20b75bed4ea163eb1d983a6495cf7b9137b3fa46` CI run #33 green;
earlier recurrence checkpoint `682d1d5f8f91e001d93e11a746fec06ab2596957`)

---

# Phase 5 — RevenueCat

Status: NOT STARTED

Goal: connect real mobile subscription state to the existing server entitlement architecture.

Implement:

- RevenueCat React Native SDK
- configured `pro` entitlement
- user identity mapping
- offerings/packages
- purchase
- restore purchase
- current customer/entitlement state
- client-side paywall state
- RevenueCat server webhook
- idempotent subscription mirror updates
- expiry/cancellation handling
- server authoritative entitlement checks

Expected server function:

`supabase/functions/revenuecat-webhook/`

Exact structure should follow existing function conventions.

## Security

The mobile app may use RevenueCat state for UI.

The backend must use the server-side subscription mirror / entitlement function for authorization.

A patched client claiming `pro=true` must still fail the server check.

## Local/dev testing

Use proper test fixtures or seeded subscription records.

Do not add a production entitlement bypass.

## Manual setup checklist

TBD after implementation.

Likely includes:

- RevenueCat project
- Apple app configuration
- App Store Connect subscription products
- RevenueCat entitlement
- RevenueCat offering/packages
- public webhook
- Supabase secrets
- sandbox purchase account/setup

Record every manual external step explicitly so implementation status and live-verification status remain separate.

## Exit criteria

- paywall can load
- purchase path wired
- restore path wired
- webhook verifies/processes events
- subscription mirror updates safely
- server entitlement works
- free user denied Find Time
- Pro user allowed Find Time
- automated tests pass
- `pnpm verify` passes
- checkpoint pushed

Checkpoint SHA:

`TBD`

---

# Phase 6 — Mobile Find Time UX

Status: NOT STARTED

Goal: expose the complete feature through the existing feature-first mobile architecture.

Follow existing patterns:

```text
route
  -> screen/component
      -> hook
          -> feature API module
              -> Supabase function
```

No direct Supabase/provider calls from presentation components.

## User flow

```text
Unscheduled task
      |
      v
[ Find Time ]
      |
  +---+---+
  |       |
Free     Pro
  |       |
Paywall   v
       loading
          |
          v
     proposals
          |
          v
    choose option
          |
          v
       confirm
          |
          v
      scheduled
```

## Proposal UI

Show useful human-facing information such as:

- day/date
- start/end
- duration
- model reason
- internal default BCal calendar target

Keep AI branding/subscription treatment consistent with the design system.

## Required UX states

- task lacks duration
- task lacks valid horizon/deadline
- loading
- no valid slots
- model/provider unavailable
- rate limited
- paywall required
- proposal available
- confirming
- slot became stale
- successful scheduling
- retry
- purchase restored

## Exit criteria

- complete happy path works
- all meaningful failure states represented
- no server-state duplication in Zustand
- TanStack Query used consistently
- routes remain thin
- design system primitives used
- accessibility considered
- `pnpm verify` passes
- checkpoint pushed

Checkpoint SHA:

`TBD`

---

# Phase 7 — Adversarial Verification + Hardening

Status: NOT STARTED

Goal: attempt to break Sprint 6 before declaring it complete.

Audit and test:

## Authorization

- cross-user task ID
- cross-user request ID
- cross-user suggestion ID
- forged entitlement
- expired entitlement

## AI boundary

- prompt injection in task title
- prompt injection in task description/note
- unknown slot
- invented timestamp
- malformed JSON
- duplicate suggestion
- invalid rank
- excessive suggestion count
- model refusal
- timeout
- transient provider outage
- permanent provider error

## Scheduling correctness

- event created after proposal
- task edited after proposal
- task completed after proposal
- task deleted after proposal
- timezone changed after proposal
- working hours changed after proposal
- internal default calendar deleted, replaced, or made read-only
- DST boundary
- exact adjacency
- buffer collision
- provider event changed remotely and now blocks the slot

## Concurrency / idempotency

- double tap Confirm
- simultaneous confirmations
- request retry
- webhook retry
- duplicate RevenueCat event

## Billing

- free user
- active Pro
- expired Pro
- cancelled but active-until-expiry
- restore purchase
- subscription renewal
- webhook replay/out-of-order delivery as applicable

## Privacy

Confirm model input does not contain:

- attendee identities
- event descriptions
- locations
- email contents
- OAuth tokens
- provider refresh/access tokens
- unnecessary calendar metadata

## Verification

Run all repo-required checks.

At minimum, as applicable:

```text
pnpm verify
Deno check/tests for functions
Supabase local reset
database tests / pgTAP
RLS tests
targeted scheduling tests
mobile typecheck
iOS simulator build
```

Run additional checks required by `AGENTS.md` and current CI.

Record exact commands and results.

---

# Manual End-to-End Verification

Status: NOT STARTED

Automated completion and external/live completion are tracked separately.

Verify with real services:

1. RevenueCat sandbox purchase.
2. Pro entitlement reaches server mirror.
3. Free user receives paywall/server denial.
4. Pro user creates unscheduled task.
5. Task has duration + deadline.
6. User taps Find Time.
7. Real configured AI model returns proposal.
8. Every proposal is genuinely conflict-free.
9. User accepts suggestion.
10. Server revalidates.
11. Time block is created.
12. Task links to time block.
13. Calendar UI reflects result.
14. Restore purchase works.
15. Expired/cancelled entitlement behaves correctly.
16. Confirmation creates the block only in the internal default BCal calendar;
    provider-backed target calendars are explicitly outside Sprint 6 v1.

Record screenshots/log identifiers where useful, but do not commit secrets.

---

# Sprint 6 Definition of Done

Sprint 6 is complete only when:

- [ ] paid user can invoke Find Time
- [ ] free user cannot bypass Pro gate
- [ ] deterministic engine exclusively determines valid availability
- [ ] AI only ranks valid generated candidates
- [ ] structured model output is validated
- [ ] no-slot path makes no model request
- [ ] model/provider configuration is server-side
- [ ] provider/model evaluation is documented
- [x] proposal persistence works
- [x] confirmation revalidates availability
- [x] confirmation is idempotent
- [x] task/calendar state updates correctly
- [x] provider-first writes remain intact
- [ ] RevenueCat purchase/restore implemented
- [ ] RevenueCat webhook/subscription mirror works
- [x] major security/privacy/adversarial cases tested
- [x] full automated verification passes
- [ ] live AI E2E passes
- [ ] live RevenueCat sandbox E2E passes
- [x] documentation reconciled with implementation
- [x] final repository state clean and pushed

---

# Running Implementation Log

Append entries. Never erase relevant historical failures or blockers.

## Entry template

### YYYY-MM-DD — Phase X / short title

Starting HEAD:

Ending HEAD:

Work completed:

- ...

Files materially changed:

- ...

Verification:

- command — PASS/FAIL
- command — PASS/FAIL

Findings:

- ...

Known blockers:

- ...

Manual/external work remaining:

- ...

Next exact action:

- ...

### 2026-09-01 — Phase 0 / audit and contract freeze

Starting HEAD:

`33fc8d3aea6ebfc0d11f747f03349081e1f993c1`

Ending HEAD:

`33fc8d3aea6ebfc0d11f747f03349081e1f993c1` (documentation changes are
uncommitted; no commit or push was requested)

Work completed:

- Audited the required architecture/product/database/AI/Sprint 5 documents and
  the current scheduling, recurrence, schema, migration, Edge Function, mobile,
  provider-write, dependency, and verification implementations.
- Recorded implementation/documentation differences and security/data-model
  prerequisites above.
- Froze the v1 target calendar, task qualification, request allowlist,
  deterministic input, privacy, Pro gate, rate limit, provider failure,
  persistence/retention, confirmation, and idempotency contracts.
- Designed the repeatable Luna-vs-Terra fixture evaluation and selection gate.
- Reconciled the AI scheduling reference and product plan with this tracker.

Files materially changed:

- `docs/sprint-6-active.md`
- `docs/ai-scheduling.md`
- `docs/sprint-3-active.md`
- `docs/sprint-4-active.md`
- `docs/sprint-5-active.md`
- `calendar_app_product_technical_plan.md`

Verification:

- `pnpm verify` — BLOCKED before project scripts: the repository package-manager
  guard could not verify/fetch the pinned pnpm 9.12.0 release signature. No
  bypass setting was used.
- direct Prettier check of every changed Markdown file — PASS
- direct repository ESLint — PASS
- direct TypeScript checks for mobile, domain, schemas, types, and UI — PASS
- direct domain Vitest — PASS (11 files, 146 tests)
- `git diff --check` — PASS

Findings:

- The deterministic whole-slot engine is usable, but recurring busy expansion
  must move to shared domain code before a server endpoint can be correct.
- Existing AI/subscription tables are foundations, not production contracts;
  forward migrations must harden client access, observability, exact candidate
  identity, confirmation idempotency, and RevenueCat replay handling.
- No Sprint 6 application code existed at the starting HEAD.

Known blockers:

- Live model comparison needs a configured server-side OpenAI API key and
  explicit evaluation run; it does not block offline Phase 1 work.
- RevenueCat/App Store configuration and sandbox accounts are external Phase 5
  prerequisites, not Phase 1 blockers.

Manual/external work remaining:

- Luna/Terra live evaluation.
- RevenueCat project, offering/products, webhook secret, and sandbox E2E.
- Live AI and purchase/restore E2E after implementation.

Next exact action:

- Begin Phase 1 with the schema tightening and shared domain recurrence-to-busy
  extraction, then build the tested deterministic server orchestration without
  any model request.

### 2026-09-01 — Phase 1 / deterministic server Find Time

Starting HEAD:

`33fc8d3aea6ebfc0d11f747f03349081e1f993c1`

Ending HEAD:

`33fc8d3aea6ebfc0d11f747f03349081e1f993c1` (Phase 0 and Phase 1 changes are
uncommitted; no commit or push was requested)

Work completed:

- Added a strict, server-owned Find Time request contract and strengthened
  scheduling/proposal validation, including supported IANA timezones, ordered
  windows, unique opaque slot IDs, and contiguous ranks.
- Established checked Deno import paths into `@cal/domain` and `@cal/schemas` so
  the Edge Function reuses the shared deterministic engine.
- Moved recurrence/provider-exception expansion into provider-neutral domain
  code and reused it from mobile and server scheduling paths.
- Added the authenticated, Pro-gated `ai-find-time` Edge Function and repository
  orchestration through task qualification, default-calendar resolution,
  bounded timezone-aware horizon calculation, busy-event expansion, and opaque
  deterministic candidate generation. It deliberately makes no model call and
  persists nothing in Phase 1.
- Reconciled stable AI error codes across shared client and Edge types.

Files materially changed:

- `packages/schemas/src/scheduling.schema.ts`
- `packages/schemas/src/primitives.ts`
- `packages/domain/src/scheduling/calendar-events.ts`
- `packages/domain/src/scheduling/calendar-events.test.ts`
- `packages/domain/src/scheduling/availability.ts`
- `apps/mobile/src/features/events/utils/expand-calendar-events.ts`
- `supabase/functions/_shared/ai/find-time.ts`
- `supabase/functions/_shared/ai/find-time-repository.ts`
- `supabase/functions/_shared/ai/find-time.test.ts`
- `supabase/functions/ai-find-time/index.ts`
- `supabase/functions/deno.json`
- shared package exports, TypeScript configuration, error types, and status docs

Verification:

- direct repository Prettier check — PASS
- direct repository ESLint — PASS
- direct TypeScript checks for mobile, domain, schemas, types, and UI — PASS
- domain Vitest — PASS (12 files, 149 tests)
- focused mobile recurrence tests — PASS (3 tests)
- `deno task check` — PASS for all Edge Function entry points
- `deno task test` — PASS (102 tests, including 13 Find Time cases)
- `supabase db reset` — PASS (all migrations and seed data applied)
- `supabase test db` — PASS (3 files, 44 tests)
- `git diff --check` — PASS
- `pnpm verify` — BLOCKED before project scripts: the package-manager guard
  could not verify/fetch the pinned pnpm 9.12.0 release signature. No bypass was
  used; the direct constituent project checks above pass.

Findings:

- The server and mobile now share recurrence-aware busy expansion, including
  Google exceptions and Microsoft materialized occurrences.
- Phase 1 can safely return valid opaque candidates, but rate limiting,
  persistence, model ranking, and confirmation remain later phases by design.

Known blockers:

- No Phase 2 code blocker. Live Luna/Terra evaluation needs a configured
  server-side OpenAI key when the provider adapter and harness are ready.
- The aggregate pnpm entry point remains environment-blocked by its signature
  verification/fetch guard; project checks themselves are green.

Manual/external work remaining:

- Commit/push the verified Phase 0 and Phase 1 checkpoint when requested.
- Luna/Terra live evaluation and RevenueCat/App Store sandbox setup in their
  planned phases.

Next exact action:

- Begin Phase 2 by adding the provider-neutral ranker interface, strict OpenAI
  Responses adapter, and offline fixture/grader harness without changing the
  deterministic availability authority.

### 2026-09-02 — Phase 2/3 / proposal generation slice

Starting HEAD:

`4678adc381cd0e85326772a5e7d6864af9589a1c`

Ending HEAD:

`f43e4e4e5d7278f09859a2c940931e1b2c2f8e77` (Phase 3 implementation
checkpoint pushed to `origin/main`; verification remains pending)

Work completed:

- Hardened proposal validation so returned ranks must be ordered contiguously,
  not merely contain a contiguous set.
- Added a provider-neutral proposal orchestrator that keeps deterministic
  candidate membership and timestamps authoritative.
- Connected the `ai-find-time` Edge Function to the lazy OpenAI adapter path.
  No-slot requests never construct a provider, but do consume the valid-attempt
  quota after deterministic preparation.
- Added server-managed request metadata, exact persisted `slot_id` mappings,
  task/calendar snapshots, and an atomic per-user rolling attempt claim.
- Removed the client update policy for AI requests and limited suggestion reads
  to proposed/accepted requests.
- Added focused orchestration tests for proposal persistence, no-slot behavior,
  and unknown provider slot rejection.

Files materially changed:

- `packages/schemas/src/scheduling.schema.ts`
- `packages/types/src/database.types.ts`
- `supabase/functions/_shared/ai/find-time.ts`
- `supabase/functions/_shared/ai/ranking.test.ts`
- `supabase/functions/_shared/ai/proposal.ts`
- `supabase/functions/_shared/ai/proposal-repository.ts`
- `supabase/functions/_shared/ai/proposal.test.ts`
- `supabase/functions/ai-find-time/index.ts`
- `supabase/migrations/20260901000015_ai_proposal_runtime.sql`
- `supabase/tests/rls.test.sql`
- `supabase/tests/scheduling.test.sql`
- `README.md`
- `docs/ai-scheduling.md`
- `docs/sprint-6-active.md`

Verification:

- `pnpm verify` — PASS (format, lint, workspace typecheck, and 149 domain tests)
- `deno task check` — PASS for all Edge Function entry points
- `deno task test` — PASS (15 files, 121 tests)
- `supabase migration up` — PASS (applied `20260901000015` to the local stack)
- `supabase db reset --yes` — PASS after creating a local data-only backup
- `supabase test db` — PASS (3 files, 53 pgTAP/RLS tests)
- `git diff --check` — PASS

Findings:

- The endpoint now reaches the Phase 3 proposal boundary, but it does not
  schedule or confirm an event. Confirmation remains Phase 4.
- OpenAI timeout configuration now rejects non-finite values such as `NaN`.
- The RLS regression test now verifies that server-managed request state is
  unchanged after a client update attempt.
- The live Luna/Terra evaluation still has not run, so the production model
  choice remains intentionally unset.

Known blockers:

- Live model comparison requires a server-side OpenAI key and explicit cost
  authorization.

Next exact action:

- Run the authorized Luna/Terra evaluation before selecting a production
  default. Phase 4 confirmation remains not started.

---

### 2026-09-02 — Phase 3 / local verification closeout

Starting HEAD:

`f43e4e4e5d7278f09859a2c940931e1b2c2f8e77`

Ending HEAD:

`feb1fa51344193532b1e730cea44ef09ca94953a` (Phase 3 fixes and local
verification checkpoint pushed to `origin/main`)

Work completed:

- Rejected non-finite `AI_TIMEOUT_MS` values in the OpenAI configuration path.
- Made the proposal test’s captured update assertion type-safe.
- Corrected the pgTAP assertion for server-managed AI request updates.
- Recorded the final local verification results and checkpoint.

Files materially changed:

- `supabase/functions/_shared/ai/openai.ts`
- `supabase/functions/_shared/ai/proposal.test.ts`
- `supabase/tests/rls.test.sql`
- `docs/sprint-6-active.md`

Verification:

- `pnpm verify` — PASS
- `deno task check` — PASS
- `deno task test` — PASS (121 tests)
- `supabase db reset --yes` — PASS after a recoverable local data backup
- `supabase test db` — PASS (3 files, 53 pgTAP/RLS tests)
- `git diff --check` — PASS

Findings:

- Phase 3 proposal generation is locally verified and does not schedule or
  confirm events; confirmation remains Phase 4.
- Live Luna/Terra evaluation remains pending and no production model is
  selected.

Known blockers:

- Live model comparison requires an authorized server-side OpenAI key and
  explicit cost authorization.

Manual/external work remaining:

- Authorized Luna/Terra evaluation.
- Phase 4 safe confirmation, when explicitly started.

Next exact action:

- Stop at the Phase 3 checkpoint. Do not begin Phase 4 in this closeout.

---

### 2026-09-02 — Phase 3 / CI generated-type alignment

Starting HEAD:

`2643ad0e55d2f3362caa55d6ea88554331756b0e`

Ending HEAD:

`3950c77f28420e7cdfb2c7a9450c96c754661a9a` (generated database types aligned
with the clean migration schema)

Work completed:

- Regenerated `packages/types/src/database.types.ts` from the clean local
  Supabase schema.
- Matched the generated field/relationship ordering and the RPC return type
  expected by CI.

Files materially changed:

- `packages/types/src/database.types.ts`

Verification:

- `pnpm verify` — PASS
- `supabase test db` — PASS (3 files, 53 pgTAP/RLS tests)
- `supabase gen types typescript --local` comparison — PASS
- `git diff --check` — PASS

Findings:

- GitHub CI runs #25 and #26 passed lint, types, and unit tests but rejected
  the stale generated database types; this follow-up addresses that gate.
- Phase 3 remains locally verified; live Luna/Terra evaluation remains
  pending and Phase 4 is not started.

Known blockers:

- Live model comparison requires an authorized server-side OpenAI key and
  explicit cost authorization.

Next exact action:

- Confirm the final GitHub CI run, then stop at the Phase 3 checkpoint.

### 2026-09-02 — Phase 4 / safe confirmation implementation and local verification

Starting HEAD:

`37fd47622ef87af5666c7b77e192eb3537aad29b`

Ending HEAD:

`004472669f0c9e8770709f836471461bd9610c5e` (Phase 4 implementation and local
verification checkpoint pushed to `origin/main`)

Documentation corrections:

- Reconciled the Phase 4 contract with the frozen Sprint 6 v1 target: only the
  provisioned internal default BCal calendar is supported; provider-backed
  target calendars are outside this sprint.
- Made server ownership/state revalidation, stale-proposal behavior,
  transaction atomicity, idempotency, concurrency, and the full verification
  gate explicit.

Implementation completed:

- Added the `ai-confirm-time` authenticated Edge Function accepting only a
  persisted suggestion ID.
- Added server-side Zod validation and explicit user-scoped suggestion,
  request, event, and task loading.
- Persisted task/profile/default-calendar versions in proposal snapshots and
  revalidated the exact slot through the shared deterministic availability
  engine before confirmation.
- Added the server-only transactional confirmation RPC with per-user advisory
  serialization, final buffered conflict checks, exactly-one internal event
  creation, task linkage, request/suggestion acceptance, canonical event
  persistence, rollback atomicity, and accepted-retry idempotency.
- Regenerated database types and added focused TypeScript and pgTAP/RLS
  coverage for ownership, stale state, conflicts, retries, concurrency, and
  failure rollback.

Material files changed:

- `docs/ai-scheduling.md`
- `docs/sprint-6-active.md`
- `packages/types/src/database.types.ts`
- `supabase/functions/_shared/ai/confirmation-repository.ts`
- `supabase/functions/_shared/ai/confirmation.test.ts`
- `supabase/functions/_shared/ai/confirmation.ts`
- `supabase/functions/_shared/ai/find-time-repository.ts`
- `supabase/functions/_shared/ai/find-time.test.ts`
- `supabase/functions/_shared/ai/find-time.ts`
- `supabase/functions/_shared/ai/proposal-repository.ts`
- `supabase/functions/_shared/ai/proposal.test.ts`
- `supabase/functions/_shared/ai/proposal.ts`
- `supabase/functions/_shared/ai/ranking.test.ts`
- `supabase/functions/ai-confirm-time/index.ts`
- `supabase/migrations/20260902000016_ai_confirmation.sql`
- `supabase/tests/confirmation.test.sql`

Verification:

- `pnpm verify` — PASS (format, lint, workspace typecheck, and 149 domain
  tests)
- `(cd supabase/functions && deno task check)` — PASS (all Edge Function
  entry points)
- `(cd supabase/functions && deno task test)` — PASS (130 tests)
- `supabase db reset --yes` — PASS (clean local reset; all migrations through
  `20260902000016_ai_confirmation.sql` applied)
- `supabase test db` — PASS (4 files, 81 pgTAP/RLS/database tests)
- `supabase gen types typescript --local | diff - packages/types/src/database.types.ts`
  — PASS
- `git diff --check` — PASS
- GitHub CI — PASS (run #28; static and Migrations/RLS jobs green):
  https://github.com/Andrewy530/BCalAI/actions/runs/33629049121

Findings:

- No contradiction with the frozen v1 architecture was found. Confirmation is
  internal-calendar-only and does not introduce a provider-backed target.
- Event writes use the existing internal direct-Postgres path; provider writes
  remain provider-first and participate in the per-user event-write lock.
- The local reset was performed only after a verified data-only backup outside
  the repository; no local database dump or test artifact is tracked.

Known blockers:

- Live Luna/Terra evaluation still requires an authorized server-side OpenAI
  key and explicit cost authorization.
- Phase 5 / RevenueCat remains intentionally unstarted.

Manual/external work remaining:

- Authorized live model evaluation and later live E2E, when credentials and
  cost authorization are available.

Next exact action:

- Await authorized live model evaluation when the server-side key and cost
  authorization are available. Do not begin Phase 5.

---

### 2026-09-02 — Phase 4 / recurrence-aware confirmation hardening

Starting HEAD:

`52981353af23be48dc842a4cd7724c4ec621a646`

Ending HEAD:

`682d1d5f8f91e001d93e11a746fec06ab2596957`

Documentation corrections:

- Kept the frozen internal default BCal calendar as the only Sprint 6 v1
  confirmation target; provider-backed target calendars remain deferred.
- Made the recurrence-aware final safety boundary, entitlement-at-confirmation
  decision, zero-duration semantics, exact verification gates, and checkpoint
  handoff explicit.

Finding and root cause:

- The independent review identified a real race: the previous final SQL check
  compared only a recurring master's raw `start_at`/`end_at`, so an occurrence
  introduced by a recurring event created or changed after Edge Function
  revalidation could occupy the proposed slot without being detected.
- The root cause was the mismatch between shared domain recurrence expansion
  and the final database transaction's raw-row overlap predicate.

Implementation completed:

- Added migration `20260902000017_ai_confirmation_recurrence.sql` with a
  server-only recurrence-aware conflict predicate and supported RRULE date
  matcher. It expands daily, weekly, monthly, and yearly occurrences in the
  event timezone; applies moved/cancelled provider exceptions; respects
  Microsoft materialized instances; honors buffers and half-open adjacency;
  and fails closed for malformed/unsupported recurrence data.
- Replaced the final confirmation conflict decision with that predicate while
  retaining the existing per-user advisory event-write lock, ownership/state
  checks, atomic event/task/request/suggestion updates, idempotency, and
  exactly-one-event behavior.
- Added focused TypeScript and pgTAP coverage for recurring occurrence
  overlap, recurring create/change after proposal persistence, moved and
  cancelled exceptions, one-off overlap, adjacency, zero-duration behavior,
  and accepted-retry idempotency.
- Regenerated `packages/types/src/database.types.ts` for the server-only
  database helpers.

Architectural decisions/findings:

- No contradiction with the frozen v1 architecture was found. The shared
  deterministic engine remains the availability authority; the SQL recurrence
  helper is only the final atomic transaction boundary needed because the
  database cannot execute the TypeScript engine.
- Entitlement is checked when the Pro proposal is generated. Phase 4
  intentionally grandfathered an already-persisted proposal through
  confirmation if entitlement later expires; no RevenueCat/billing behavior
  was invented before Phase 5.
- Zero-duration events match domain interval normalization: they do not block
  with no buffer, and a positive buffer grows them into point blockers.
- The clean reset used a recoverable data-only backup outside the repository;
  no local database dump, backup, or test artifact is tracked.

Files materially changed:

- `docs/ai-scheduling.md`
- `docs/sprint-6-active.md`
- `packages/types/src/database.types.ts`
- `supabase/functions/_shared/ai/confirmation.test.ts`
- `supabase/migrations/20260902000017_ai_confirmation_recurrence.sql`
- `supabase/tests/confirmation_recurrence.test.sql`

Verification:

- `deno test --allow-env _shared/ai/confirmation.test.ts` from
  `supabase/functions` — PASS (11 tests)
- `pnpm verify` — PASS (format, lint, workspace typecheck, and 149 domain
  tests)
- `(cd supabase/functions && deno task check)` — PASS
- `(cd supabase/functions && deno task test)` — PASS (132 tests)
- `supabase db reset --yes` — PASS (clean reset; all migrations through
  `20260902000017_ai_confirmation_recurrence.sql` applied)
- `supabase test db` — PASS (5 files, 101 pgTAP/RLS/database tests)
- `pnpm db:types` — PASS
- `supabase gen types typescript --local | diff - packages/types/src/database.types.ts`
  — PASS
- `git diff --check` — PASS
- GitHub CI — PASS (run #30; Lint, types, unit tests, and Migrations/RLS all
  green): https://github.com/Andrewy530/BCalAI/actions/runs/33636188575

Known blockers/manual items:

- Authorized live Luna/Terra evaluation still requires a server-side OpenAI
  key and explicit cost authorization.
- Phase 5 / RevenueCat remains intentionally unstarted.

Next exact action:

- Checkpoint is committed, pushed, and CI-green. Stop and await authorized live
  model evaluation. Do not begin Phase 5.

### 2026-09-03 — Phase 4 safe confirmation, recurrence, and availability review hardening

Starting HEAD: `e06b22c66d216f4077ea41a27e77bfa1684c3bb2`  
Ending HEAD: `222e7652ec948c63172728a478c36acde5b52096` (public pushed review hardening checkpoint; earlier draft referenced local pre-push SHA `9986d4e6a0b280104c2feb6e04110aadf90cd2e0`)

Accomplished in this slice:

- Investigated, reproduced, and confirmed all 7 review findings in the full Mac verification toolchain (Docker/PostgreSQL, Deno, pnpm, Vitest, pgTAP).
- **Finding 1 (Candidate slot millisecond preservation)**:
  - Reproduced: `alignToGrid` in `packages/domain/src/scheduling/availability.ts` preserved non-zero milliseconds from `new Date()` clock fixtures. Because proposal generation and confirmation revalidation execute at different milliseconds, generated candidate timestamps differed at the millisecond level, causing exact-instant comparisons (`sameInstant`) to fail and erroneously return 409 `AI_PROPOSAL_STALE`.
  - Fix: Updated `alignToGrid` to extract sub-second milliseconds and subtract elapsed milliseconds within the block, ensuring all generated candidate slots land on exact `:00.000Z` boundaries.
  - Regression tests: Added tests with non-zero millisecond clock fixtures to `packages/domain/src/scheduling/availability.test.ts` and `supabase/functions/_shared/ai/confirmation.test.ts`.
- **Finding 2 (Recurrence exception matching format fragility)**:
  - Reproduced: `packages/domain/src/scheduling/calendar-events.ts` compared raw database strings (`recurrenceOriginalStartAt`) against `new Date(occurrence.start).toISOString()`. PostgREST / database representations with explicit timezone offsets (e.g. `+00:00`, `-04:00`), space separators, or non-millisecond strings failed string equality in the Map lookup.
  - Fix: Keyed `instanceByOriginalStart` Map by canonical numeric epoch milliseconds (`Date.parse(...)`) and looked up with numeric `occurrence.start`.
  - Regression tests: Added tests with explicit `+00:00` and non-UTC `-04:00` timestamp formats to `packages/domain/src/scheduling/calendar-events.test.ts`.
- **Finding 3 (Materialized recurring exception moved into window from outside)**:
  - Reproduced: `expandSchedulingCalendarEvents` skipped all exceptions of a known master, expecting the master's `expandOccurrences` loop to handle them. However, `expandOccurrences(..., window)` only yields occurrences whose original start was within `window`. A non-cancelled exception whose original start was outside the window but whose effective moved start was inside the window was omitted by TypeScript, while SQL confirmation detected the conflict.
  - Fix: Tracked matched instances during `expandOccurrences`. Any non-cancelled exception in `instances` not matched by `expandOccurrences` is added via `addOneOff(expanded, instance, window)`.
  - Regression tests: Added test for exception moved into window from outside to `packages/domain/src/scheduling/calendar-events.test.ts` and `supabase/tests/confirmation_recurrence.test.sql`.
- **Finding 4 (SQL recurrence conflict helper performance)**:
  - Investigated & profiled: Benchmarked `ai_event_conflicts_interval` on representative datasets (5,000 past events + 50 past recurring series). The baseline execution took ~1,334 ms.
  - Root cause: (1) `pg_catalog.pg_timezone_names` view query inside the PL/pgSQL loop scanned the OS filesystem on every recurring event (1,274 ms); (2) outer query scanned all user events without index filtering on non-overlapping one-offs; (3) series with `COUNT` or `UNTIL` that ended in the past were scanned day-by-day.
  - Fix in migration `20260903000018_ai_confirmation_hardening.sql`: Replaced `pg_timezone_names` scan with PostgreSQL internal timezone resolution in a `begin ... perform now() at time zone tz; exception ... end;` block (0.66 ms, 2000x faster); filtered outer query to overlapping one-offs, exceptions, and series; added early exit for expired recurring series before scan start date.
  - Benchmark result: Execution time dropped from 1,334 ms to 3.14 ms (425x speedup).
- **Finding 5 (Edge Function fast path error consistency)**:
  - Reproduced: In `supabase/functions/_shared/ai/confirmation.ts`, `finishAccepted` threw 500 `UNKNOWN` when `!canonical`, whereas SQL RPC returns `'stale'` (409 `AI_PROPOSAL_STALE`) if the accepted event row is deleted.
  - Fix: Updated `finishAccepted` to throw `staleProposal()` (409 `AI_PROPOSAL_STALE`) when `!canonical`.
  - Regression tests: Added test to `supabase/functions/_shared/ai/confirmation.test.ts`.
- **Finding 6 (SQL confirmation defense-in-depth for elapsed suggestion start time)**:
  - Reproduced: `confirm_ai_schedule_suggestion` did not check `v_suggestion.start_at <= now()` during the proposed path. If suggestion start time elapsed between Edge revalidation and transaction execution, a past event could be accepted.
  - Fix in migration `20260903000018_ai_confirmation_hardening.sql`: Added `if v_suggestion.start_at <= now() then return query select 'stale'::text, null::uuid; return; end if;` to proposed path in `confirm_ai_schedule_suggestion`.
  - Regression tests: Added test to `supabase/tests/confirmation.test.sql`.
- **Finding 7 (DST fall-back ambiguous local time alignment)**:
  - Reproduced: Targeted test on 2026-11-01 at 01:30 local in `America/New_York` showed TypeScript `zonedWallClockToUtc` resolved to 05:30Z (first/daylight occurrence, EDT), whereas PostgreSQL `AT TIME ZONE` resolved to 06:30Z (second/standard occurrence, EST). This caused TS availability to deem 06:30Z free and propose it, but SQL confirmation evaluated 06:30Z as conflicting and rejected the proposal as stale.
  - Fix in migration `20260903000018_ai_confirmation_hardening.sql`: In `ai_event_conflicts_interval`, detected fall-back ambiguous local time when `(v_occurrence_start - interval '1 hour') at time zone tz = (v_cursor_date::timestamp + v_anchor_time)` (or 30 mins) and adjusted `v_occurrence_start` by subtracting the interval, aligning PostgreSQL with `@cal/domain`.
  - Regression tests: Added test to `supabase/tests/confirmation_recurrence.test.sql`.

Exact verification commands and results:

- `pnpm -F @cal/domain test` — PASS (12 files, 152 tests)
- `(cd supabase/functions && deno test --allow-env _shared/ai/confirmation.test.ts)` — PASS (13 tests)
- `(cd supabase/functions && deno task check)` — PASS
- `(cd supabase/functions && deno task test)` — PASS (134 tests)
- `supabase db reset --yes` — PASS (clean replay through migration `20260903000018`)
- `supabase test db` — PASS (5 test files, 105 tests)
- `supabase gen types typescript --local | diff - packages/types/src/database.types.ts` — PASS (zero diff)
- `pnpm verify` — PASS (Prettier, ESLint, 6 workspace typechecks, domain vitests)
- `git diff --check` — PASS
- GitHub CI on `222e7652ec948c63172728a478c36acde5b52096`: Run #32 (https://github.com/Andrewy530/BCalAI/actions/runs/33726421649) — `Migrations and RLS` passed; `Lint, types, unit tests` failed at `Format` step with exit code 1 due to Prettier Markdown list formatting in `docs/sprint-6-active.md`.
- Follow-up formatting fix: `20b75bed4ea163eb1d983a6495cf7b9137b3fa46` (`chore: fix formatting in sprint-6-active.md`).
- GitHub CI on `20b75bed4ea163eb1d983a6495cf7b9137b3fa46`: Run #33 (https://github.com/Andrewy530/BCalAI/actions/runs/33727292639) — PASS (all jobs green).

### 2026-09-03 — Phase 4 final closeout and tracker reconciliation

Starting HEAD: `20b75bed4ea163eb1d983a6495cf7b9137b3fa46`
Ending HEAD: `56329e3669f353f3e35696c3f7884f1ca2bda8a4`

Accomplished in this slice:

- Investigated and reproduced the root cause of GitHub CI run #32 failure on commit `222e7652ec948c63172728a478c36acde5b52096`:
  Prettier format check failed with exit code 1 due to `docs/sprint-6-active.md` lacking a blank line before the Markdown unordered list item under "Exact verification commands and results:".
- Confirmed commit `20b75bed4ea163eb1d983a6495cf7b9137b3fa46` resolved the formatting defect, resulting in fully green GitHub CI run #33 (https://github.com/Andrewy530/BCalAI/actions/runs/33727292639).
- Reconciled the Sprint 6 tracker so `docs/sprint-6-active.md` accurately identifies the public pushed review hardening lineage (`222e7652ec948c63172728a478c36acde5b52096` -> `20b75bed4ea163eb1d983a6495cf7b9137b3fa46`) rather than the stale unpushed local SHA `9986d4e6a0b280104c2feb6e04110aadf90cd2e0`.
- Verified no unintended product changes were introduced.
- Executed the complete Phase 4 verification gate suite from clean `main`:
  - `pnpm verify` — PASS (Prettier, ESLint, 6 workspace typechecks, 152 domain vitests)
  - `(cd supabase/functions && deno task check)` — PASS
  - `(cd supabase/functions && deno task test)` — PASS (134 tests)
  - `supabase db reset --yes` — PASS (clean replay through migration `20260903000018`)
  - `supabase test db` — PASS (5 test files, 105 pgTAP tests)
  - `supabase gen types typescript --local | diff - packages/types/src/database.types.ts` — PASS (zero diff)
  - `git diff --check` — PASS
- GitHub CI on `56329e3669f353f3e35696c3f7884f1ca2bda8a4`: Run #34 (https://github.com/Andrewy530/BCalAI/actions/runs/33731653046) — PASS (all jobs green).

---

### 2026-09-03 — Phase 1 adversarial hardening

Starting HEAD: `2200d4100f101445ddfc30f02bf2dda52fe6838b`

Implementation/pushed SHA:
`56860bfb56efc562dc87711722c5bba46044dd31`

GitHub CI: PASS — [CI run 33820931605](https://github.com/Andrewy530/BCalAI/actions/runs/33820931605).
Both `Lint, types, unit tests` and the hosted `Migrations and RLS` job
completed successfully.

Confirmed findings and fixes:

1. **Read-only internal default reached proposal preparation.** The calendars
   table permits an internal default to be read-only, the repository query did
   not exclude it, and deterministic preparation checked only for a missing
   row. The repository now explicitly filters for an internal source, the
   default flag, and a false read-only flag; preparation repeats all three
   checks as a server-boundary invariant and returns
   `AI_DEFAULT_CALENDAR_MISSING` without selecting a fallback.
2. **Positive buffers missed events just outside the raw scheduling window.**
   Events were loaded and recurrence-expanded only over the unbuffered window,
   then padded afterward, so an event ending shortly before the window or
   starting shortly after it could create false availability at the boundary.
   Event loading and expansion now use the authoritative window expanded by the
   validated buffer while candidate generation remains clipped to the original
   window.
3. **The blocking-event query could be silently truncated.** A single
   PostgREST result depended on the configured maximum row count while the
   correctness-preserving recurrence query intentionally includes masters whose
   raw interval is outside the window. The repository now pages with an exact
   count and stable `start_at, id` ordering, advances by the number of rows
   actually returned, and fails closed on a missing count or incomplete page.
4. **Sparse Microsoft materialization dropped busy occurrences.** The presence
   of any Microsoft instance caused the whole master to be skipped, assuming
   complete materialization. Shared provider-neutral expansion now treats every
   matching materialized instance as an override and expands the master to fill
   missing occurrences, without duplicating materialized rows.
5. **Recurring occurrences lost sub-second precision.** Expansion rebuilt wall
   clock starts with hour/minute only, shifting provider or persisted series
   whose anchor had seconds or milliseconds. The shared timezone conversion and
   recurrence expansion now preserve both fields.
6. **Long-lived finite series could become falsely free.** `COUNT` prevented the
   daily/weekly fast-forward path, and the 5,000-iteration safety guard silently
   stopped before a later valid occurrence. Daily and weekly rules now
   fast-forward with the correct global occurrence index; exhausting the guard
   throws instead of silently returning incomplete availability.
7. **Unsupported persisted RRULEs could become falsely free.** Generic
   recurrence display fallback treats an unsupported rule as one occurrence,
   which is safe for rendering but unsafe for server availability when the
   master began outside the query window. The scheduling-to-busy boundary now
   rejects unsupported non-cancelled rules before candidate generation.

Regression coverage added:

- Deno orchestration coverage for writable target-calendar invariants and
  buffer-aware event loading at the window boundary.
- Deno repository coverage for the exact default-calendar filters and complete
  pagination even when the server returns fewer rows than requested.
- Domain coverage for sparse Microsoft materialization, unsupported-rule
  fail-closed behavior, recurrence anchor seconds/milliseconds, and a valid
  7,000-occurrence daily series whose current occurrence lies beyond the old
  iteration ceiling.
- The existing mobile shared-recurrence test was tightened to verify that
  materialized instances replace matching generated occurrences without
  duplicates.

Suspected cases found already safe and left unchanged:

- The strict public request schema exposes only task ID, note, bounded window,
  buffer, local minute band, and time-of-day preference; engine-owned fields
  remain rejected.
- Task ownership is scoped in the repository query, all non-open/non-flexible
  or linked tasks are rejected, duration comes only from the task estimate, and
  database integer/range constraints plus server validation reject invalid
  durations.
- Horizon normalization clamps past starts to now and caps the end by the exact
  timed/date-only deadline, explicit end, and 14 local-day boundary.
- Working-hour intervals, local minute bands including 00:00/24:00, overlapping
  windows, half-open adjacency, zero-duration/buffer behavior, DST conversion,
  and candidate uniqueness remain enforced by the shared schemas/domain engine.
- All owned event sources and hidden calendars remain blocking; only cancelled
  effective occurrences are excluded. Moved/cancelled Google exceptions and
  provider timestamp-offset equivalence remain handled by shared expansion.
- AI receives only sanitized task/ranking context and opaque candidate IDs;
  event content, calendar visibility, attendees, locations, and provider
  credentials are neither queried for preparation nor sent to the model.
- Phase 3 candidate membership/persistence and Phase 4 exact-slot revalidation,
  snapshot, recurrence, zero-duration, and idempotency contracts remain intact.

Verification completed without Docker:

- Focused domain recurrence/scheduling/timezone tests — PASS (73 tests).
- Focused Deno Find Time orchestration/repository tests — PASS (17 tests).
- Focused mobile shared recurrence test — PASS (3 tests).
- `pnpm verify` — PASS (Prettier, ESLint, six workspace typechecks, 156 domain
  tests).
- `(cd supabase/functions && deno task check)` — PASS.
- `(cd supabase/functions && deno task test)` — PASS (138 tests).

Windows-native verification pending by explicit user direction after Docker
Desktop failed to start with the recurring `sailor-ingest.sock` stale-socket
error:

- `supabase db reset --yes`
- `supabase test db`
- exact generated Supabase TypeScript types comparison against
  `packages/types/src/database.types.ts`

The hosted CI job independently started Supabase, applied migrations from
scratch, passed database tests, and passed its exact generated-types check. It
does not replace the specifically requested Windows-native evidence above. No
Docker reset, reinstall, socket deletion, or configuration change was
performed. The blocking-event query remains intentionally recurrence-correct
and therefore grows with the number of stored series masters; pagination now
preserves correctness, but a production-scale query benchmark remains pending
with the local Docker/database gates. Live Luna/Terra evaluation and Phase 5
remain out of scope.

---

### 2026-09-04 — Phase 2 adversarial hardening

Starting HEAD: `df570091486c04e7fcf0166e59118855457f7655`

Implementation/pushed SHA: `c6a5fca6e180f92d790d8865ef6a9e035c9c823b`

GitHub CI: PASS — [CI run 33822750795](https://github.com/Andrewy530/BCalAI/actions/runs/33822750795).
Both `Lint, types, unit tests` and the hosted `Migrations and RLS` job
completed successfully.

Confirmed findings and fixes:

1. **Mechanical grader passed invalid proposals, unknown slots, and duplicates.**
   `gradeFixture` in `_shared/ai/evaluation/harness.ts` assumed that any non-null
   provider result was already safe, inspecting only the rank 1 candidate ID. If
   a provider returned an unknown slot at rank 2+, duplicate slot IDs, duplicate
   ranks, or malformed proposal schemas (e.g. out-of-range scores or negative
   ranks), `gradeFixture` returned `passed: true`.
   Fix: Added schema validation via `aiScheduleProposalSchema.safeParse` and
   strict candidate ID membership checks against `fixture.input.candidates`
   directly inside `gradeFixture`. Any schema violation or unknown slot fails
   `candidateSafetyPassed`, `invariantPassed`, and `passed`.
   Regression tests: Added tests in `_shared/ai/evaluation/harness.test.ts`
   asserting rejection of unknown slots at rank 2, duplicate slots, duplicate
   ranks, and out-of-range scores.

2. **OpenAI response parser ambiguously accepted multiple output texts and messages.**
   `parseOutputJson` in `_shared/ai/openai.ts` looped over response output items
   and content parts, unconditionally assigning `outputText = parsedText.data.text`.
   If a provider response contained multiple messages with `output_text` or a
   single message with multiple `output_text` parts, earlier outputs were
   silently discarded and the last text was accepted.
   Fix: If `outputText` is already populated when another `output_text` item is
   encountered, `parseOutputJson` immediately throws `AI_INVALID_OUTPUT` (502).
   Regression tests: Added tests in `_shared/ai/openai.test.ts` verifying
   rejection of responses with multiple `output_text` parts or multiple messages.

3. **Configuration parser accepted whitespace-only model names and raw whitespace.**
   `openAiRankingConfigFromEnv` in `_shared/ai/openai.ts` checked only
   `model.length === 0`. A whitespace-only string such as `"   "` evaluated to
   length 3 and was accepted. Additionally, `OPENAI_API_KEY="   "` passed the
   falsy check, and environment strings with leading/trailing whitespace were
   not trimmed.
   Fix: Sanitized and trimmed all environment strings (`AI_PROVIDER`,
   `OPENAI_API_KEY`, `AI_MODEL`, `AI_REASONING_EFFORT`, `AI_TIMEOUT_MS`) before
   validation, and explicitly rejected whitespace-only API keys and model names.
   Regression tests: Added tests in `_shared/ai/openai.test.ts` for
   whitespace-only keys, whitespace-only models, and trimmed valid values.

4. **Response usage schema rejected valid responses with omitted/partial token counts.**
   `responseUsageSchema` in `_shared/ai/openai.ts` required `input_tokens`,
   `output_tokens`, and `total_tokens` as non-nullable integers. If OpenAI
   returned an object where individual token counts were missing, null, or
   partially reported, `openAiResponseSchema.safeParse` failed and rejected an
   otherwise completely valid proposal as `AI_INVALID_OUTPUT`.
   Fix: Allowed token counts and reasoning details to be nullable and optional
   in `responseUsageSchema` while preserving integer, non-negative, and
   malformed-type validation.
   Regression tests: Added tests in `_shared/ai/openai.test.ts` for null usage,
   partial usage (`total_tokens` only), and malformed usage rejection.

5. **Redundant duplicate in `EdgeErrorCode` union.**
   `EdgeErrorCode` in `_shared/errors/index.ts` defined `'AI_RATE_LIMITED'` twice.
   Fix: Deduplicated union type definition.

6. **Repo-wide development provenance documentation cleanup.**
   Neutralized coding-assistant, IDE agent, and model attribution across tracked
   documentation files (`docs/sprint-6-active.md`, `docs/sprint-4-active.md`,
   `calendar_app_product_technical_plan.md`, `README.md`). Cleaned tracker
   templates to remove `Agent/model` prompts and adjusted process wording to
   neutral technical equivalents. Legitimate product AI scheduling references
   (OpenAI, Responses API, `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY`,
   `gpt-5.6-luna`, `gpt-5.6-terra`, etc.) were preserved.

Suspected cases investigated and verified safe:

- Deterministic shortlist cap and mathematical distribution: Verified
  `evenlySpacedShortlist` across 0, 1, 40, 41, and 1,000+ candidates.
  Chronological endpoints are guaranteed, strictly increasing index steps
  prevent duplicate candidates, and cap (40) is strictly respected.
- Output proposal validation: Validated that Zod `.strict()` and
  `superRefine` reject unknown slot IDs, duplicate slot IDs, duplicate ranks,
  non-contiguous ranks, scores out of range, oversized/empty reasons, and
  provider-generated timestamps.
- Provider retry and timeout budget: Verified that transient failures (408, 429,
  500, 502, 503, network errors) retry at most once within the total deadline,
  permanent 4xx errors are never retried, and `Retry-After` headers are bounded.
- Model input privacy: Verified that `buildAiRankingInput` forwards only approved
  scheduling context with opaque candidate IDs, excluding calendar rows,
  event content, attendee lists, locations, and credentials.
- Prompt injection resistance: Verified that user task titles and notes are
  serialized strictly as data strings and cannot inject schema parameters or
  instructions.
- Privacy & logging: Confirmed no authorization headers, API keys, full prompts,
  or provider bodies are logged in errors or output.
- Live evaluation runner: Confirmed `run-live.ts` remains strictly gated behind
  `RUN_LIVE_AI_EVAL=true` and was not executed.

Verification:

- `pnpm verify` — PASS (Prettier, ESLint, 6 workspace typechecks, 156 domain tests)
- `(cd supabase/functions && deno task check)` — PASS
- `(cd supabase/functions && deno task test)` — PASS (141 tests)
- `git diff --check` — PASS

Remaining manual/external work:

- Live Luna / Terra production model evaluation remains pending server-side API
  key and cost authorization. Docker-backed local database reset/pgTAP verification
  remains pending local Docker Desktop runtime resolution.

---

### 2026-09-04 — Phase 3 adversarial hardening

Starting HEAD: `322a9562e9299e788741a4b90484848f6dc0da3f`

Confirmed findings and fixes:

1. **`updateRequest` in `proposal-repository.ts` silently succeeded on 0 rows updated.**
   PostgREST updates matching 0 rows (e.g. non-existent request ID or mismatched
   user ID) return `error: null` and `data: null`. As a result,
   `updateRequest` resolved without error, falsely reporting successful state
   transition (e.g. `pending`, `proposed`, or `failed`).
   Fix: Chained `.select('id')` to the update query and asserted `data` is
   non-empty (`data && data.length > 0`), throwing `persistenceError('update', 'not_found')`
   (500 UNKNOWN EdgeError) if no matching row was modified.
   Regression tests: Added tests in `_shared/ai/proposal.test.ts` verifying that
   `supabaseAiScheduleRepository.updateRequest` rejects 0-row matches with a 500
   UNKNOWN EdgeError and succeeds with proper filters when a row matches.

Suspected cases investigated and verified safe:

- Zero-candidate early exit: Verified that if candidate slot count is 0, the
  endpoint records a `failed` request with `AI_NO_VALID_SLOT`, throws 422
  `AI_NO_VALID_SLOT`, and completely bypasses `createProvider()`.
- Deterministic candidate-only ranking: Verified that `validateAiRankingProposal`
  enforces contiguous ranks 1..N matching only candidate IDs from the deterministic
  engine, rejecting unknown slots, duplicate slots, timestamp generation, and extra fields.
- Atomic rate limiting / advisory lock: Verified that `claim_ai_schedule_request`
  uses `pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0))` for serial
  per-user concurrency control, returning `null` and failing with 429 `AI_RATE_LIMITED`
  when the rolling quota is exceeded.
- Suggestion persistence: Verified that `insertSuggestions` parses inserted rows
  with Zod, asserts row count equality against generated suggestions, and maintains
  rank ordering.
- Failure containment: Verified that errors during candidate loading, provider ranking,
  or persistence trigger `markRequestFailed` with the exact error code without
  corrupting existing state.

Verification:

- `pnpm verify` — PASS (Prettier, ESLint, 6 workspace typechecks, 156 domain tests)
- `(cd supabase/functions && deno task check)` — PASS
- `(cd supabase/functions && deno task test)` — PASS (143 tests)
- `git diff --check` — PASS

---

# Current Decisions

| Decision                                     | Status   | Choice                                                   |
| -------------------------------------------- | -------- | -------------------------------------------------------- |
| AI provider                                  | evaluate | OpenAI                                                   |
| AI API                                       | final    | Responses API                                            |
| default AI model                             | evaluate | `gpt-5.6-luna`                                           |
| comparison model                             | evaluate | `gpt-5.6-terra`                                          |
| reasoning effort                             | final    | `low` initially; server-configurable                     |
| OpenAI response storage                      | final    | `store: false`                                           |
| AI availability authority                    | final    | deterministic engine only                                |
| AI output                                    | final    | opaque generated slot IDs + rank/score/reason            |
| confirmation                                 | final    | always required in Sprint 6                              |
| server entitlement                           | final    | authoritative `has_active_entitlement`                   |
| mobile AI API key                            | final    | forbidden                                                |
| target calendar                              | final    | internal default BCal calendar in v1                     |
| provider-calendar target                     | deferred | preserve provider-first path when added                  |
| split-task scheduling                        | deferred | whole-duration slots only in v1                          |
| duration                                     | final    | task estimate required; no silent profile fallback       |
| horizon                                      | final    | deadline/bounded override, maximum 14 days               |
| rate-limit policy                            | final    | 10 claimed attempts / rolling 60 minutes / user          |
| heuristic production fallback                | final    | none in v1; baseline/test oracle only                    |
| cross-provider AI fallback                   | final    | none in v1                                               |
| entity-specific event semantics in AI prompt | deferred | event content remains outside model privacy boundary     |
| operational AI retention                     | final    | 30 days; no full prompts/provider bodies                 |
| model candidate cap                          | final    | deterministic diverse shortlist of at most 40 candidates |

---

# Handoff Protocol

When an implementation session is approaching its context boundary:

1. Stop beginning new architectural work.
2. Finish the smallest safe current unit if feasible.
3. Run relevant verification.
4. Update this file.
5. Record exact HEAD.
6. Record any uncommitted files.
7. Record failed commands and error output summary.
8. State the next exact action.
9. Push a coherent checkpoint when safe.
10. Do not mark incomplete work complete.

The next implementer must:

1. Read this tracker first.
2. Confirm branch and HEAD.
3. Inspect changes since the last recorded checkpoint.
4. Read any relevant surrounding implementation.
5. Continue the documented next action.
6. Avoid redesigning completed phases without concrete evidence of a problem.

---

# Current Handoff

Current phase:

`Phase 4 safe confirmation and recurrence hardening complete; Phase 5 not
started`

Last verified checkpoint:

`322a9562e9299e788741a4b90484848f6dc0da3f` (Phase 2 hardening checkpoint; GitHub CI
run #36 is green)

Phase 1 hardening checkpoint:

`56860bfb56efc562dc87711722c5bba46044dd31` (pushed Phase 1 hardening
checkpoint; GitHub CI run #35 is green)

Phase 2 hardening checkpoint:

`c6a5fca6e180f92d790d8865ef6a9e035c9c823b` (pushed Phase 2 adversarial
hardening and documentation provenance cleanup; GitHub CI run #36 is green)

Phase 3 hardening checkpoint:

Pending push (hardened `updateRequest` row match verification; zero-candidate early exit, deterministic candidate ranking validation, suggestion persistence invariants verified)

Phase 3 implementation checkpoint:

`37fd47622ef87af5666c7b77e192eb3537aad29b` (pushed implementation and
verification checkpoint; generated database types aligned for CI)

Phase 4 implementation checkpoint:

`004472669f0c9e8770709f836471461bd9610c5e` (pushed Phase 4 implementation
and verification checkpoint; GitHub CI run #28 is green)

Phase 4 recurrence-hardening checkpoint:

`682d1d5f8f91e001d93e11a746fec06ab2596957` (pushed recurrence hardening
checkpoint; GitHub CI run #30 is green)

Phase 4 review-hardening checkpoint:

`222e7652ec948c63172728a478c36acde5b52096` (review hardening; CI #32) followed
by `20b75bed4ea163eb1d983a6495cf7b9137b3fa46` (formatting fix; GitHub CI run #33 green)

Current blocker:

`Live Luna/Terra evaluation still needs an authorized server-side OpenAI key
and explicit cost authorization. Phase 5 / RevenueCat remains intentionally
unstarted.`

Next exact action:

Await authorized live model evaluation when the server-side key and cost
authorization are available. Do not begin Phase 5. Preserve deterministic
candidate membership as the sole availability authority.
