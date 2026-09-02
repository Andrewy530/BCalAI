# Sprint 6 — AI Pro / Find Time

Status: PHASE 2 FOUNDATION IMPLEMENTED — PHASE 3 PROPOSAL IMPLEMENTATION
AND LOCAL VERIFICATION COMPLETE; LIVE MODEL EVALUATION PENDING

This file is the source of truth for Sprint 6 implementation and agent handoff.

Any agent continuing Sprint 6 must read this file, `AGENTS.md`, `docs/architecture.md`, `docs/ai-scheduling.md`, and the relevant implementation before making changes.

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

Where does an accepted Find Time block get created?

Decision required:

- default internal BCal calendar, or
- selected/default user calendar, including provider calendars

The implementation must never silently guess if the repository has no defined default.

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
task version, target calendar, accepted event, provider/model/prompt version,
candidate count, latency, token counts, and stable error class. Full prompts,
full provider responses, task descriptions, event content, and secrets are not
stored or logged. OpenAI requests use `store: false`.

Operational request/suggestion detail expires after 30 days; accepted task and
event rows remain canonical product data. Aggregate metrics may be retained
without task text, note text, timestamps, or calendar content. Account deletion
continues to cascade all user-linked operational rows.

### Confirmation and idempotency

The client confirms a persisted suggestion ID, never arbitrary timestamps. The
server reloads the task/request/suggestion/default calendar, verifies ownership
and state, regenerates availability from current profile/events, and requires
an exact slot match immediately before writing.

V1 confirmation creates one internal event, links `tasks.scheduled_event_id`,
sets the task to `scheduled`, marks one suggestion/request accepted, and stores
the accepted event ID through one server-authoritative idempotent operation.
Repeated confirmation returns the same canonical event. Changed task/profile/
calendar state or a new conflict returns a stale-proposal error and creates
nothing. Provider-first confirmation is retained as a future extension, not
partially implemented in v1.

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

`feb1fa51344193532b1e730cea44ef09ca94953a`

---

# Phase 4 — Safe Confirmation / Scheduling

Status: NOT STARTED

Goal: convert a proposal into a real scheduled block safely.

Create a server-authoritative confirmation path.

Client should identify the persisted request/suggestion rather than supplying trusted arbitrary timestamps.

Confirmation flow:

1. Authenticate.
2. Load persisted suggestion.
3. Verify request belongs to user.
4. Verify task still exists.
5. Verify task still qualifies.
6. Verify proposal/request state permits confirmation.
7. Determine target calendar.
8. Regenerate/revalidate current availability.
9. Confirm exact suggestion remains valid.
10. Create calendar block using the correct write architecture.
11. Link task to scheduled event/block.
12. Mark appropriate AI records accepted.
13. Return canonical event/task state.

## Race-condition rules

Proposal != reservation.

If availability changed:

- do not create overlapping event
- return stale/conflict error
- allow client to request fresh proposals

## Idempotency

Protect against:

- double tap
- mobile retry
- duplicate network delivery
- repeated confirmation of same suggestion

Exactly one successful accepted suggestion should produce exactly one scheduled block.

## Provider calendars

If target calendar is provider-owned:

- follow provider-first mutation rules
- wait for provider confirmation as required by current architecture
- then update normalized BCal state

Do not create local state first and hope external synchronization succeeds.

## Exit criteria

- stale suggestions rejected
- double-confirm safe
- task/event linkage correct
- provider-first architecture preserved
- integration tests pass
- `pnpm verify` passes
- checkpoint pushed

Checkpoint SHA:

`TBD`

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
- selected target calendar if applicable

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
- target calendar deleted
- DST boundary
- exact adjacency
- buffer collision
- provider event changed remotely

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
16. Provider-backed target calendar works if included in Sprint 6 scope.

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
- [ ] proposal persistence works
- [ ] confirmation revalidates availability
- [ ] confirmation is idempotent
- [ ] task/calendar state updates correctly
- [ ] provider-first writes remain intact
- [ ] RevenueCat purchase/restore implemented
- [ ] RevenueCat webhook/subscription mirror works
- [ ] major security/privacy/adversarial cases tested
- [ ] full automated verification passes
- [ ] live AI E2E passes
- [ ] live RevenueCat sandbox E2E passes
- [ ] documentation reconciled with implementation
- [ ] final repository state clean and pushed

---

# Running Implementation Log

Agents append entries. Never erase relevant historical failures or blockers.

## Entry template

### YYYY-MM-DD — Phase X / short title

Agent/model:

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

Agent/model:

Codex

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

- `README.md`
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

Agent/model:

Codex

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

Agent/model:

Codex

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

Agent/model:

Codex

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

When an agent is approaching its context/quota boundary:

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

The next agent must:

1. Read this tracker first.
2. Confirm branch and HEAD.
3. Inspect changes since the last recorded checkpoint.
4. Read any relevant surrounding implementation.
5. Continue the documented next action.
6. Avoid redesigning completed phases without concrete evidence of a problem.

---

# Current Handoff

Current phase:

`Phase 2 foundation implemented; Phase 3 proposal implementation and local
verification complete; live model evaluation pending`

Last verified checkpoint:

`feb1fa51344193532b1e730cea44ef09ca94953a` (clean, pushed Phase 3
verification checkpoint)

Phase 3 implementation checkpoint:

`feb1fa51344193532b1e730cea44ef09ca94953a` (pushed implementation and
verification checkpoint)

Current blocker:

`Live Luna/Terra evaluation needs an authorized server-side OpenAI key and
explicit cost authorization. RevenueCat setup remains a later external gate.`

Next exact action:

Perform the authorized Luna/Terra evaluation when its server-side key and cost
authorization are available. Do not begin Phase 4 in this closeout. Preserve
deterministic candidate membership as the sole availability authority.
