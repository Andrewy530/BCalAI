# 0004 — Deterministic scheduling, AI ranking

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The paid feature is "find time for this task". The tempting implementation is to
hand a model the calendar and the task and let it answer. That produces
double-bookings, time-zone errors, and appointments outside working hours — in
the one app where the user's trust depends on those never happening.

## Decision

Split the problem:

- **Deterministic code** computes what is actually free: working-hour expansion,
  DST-correct wall-clock maths, buffer padding, interval subtraction, slot
  generation. Pure, synchronous, unit-tested, in `packages/domain`.
- **The model** ranks the slots the engine produced and explains why, returning
  only slot ids it was given.

Model output is validated against `aiScheduleProposalSchema`, and a `slotId` the
engine did not generate is rejected as `AI_INVALID_OUTPUT`.

## Consequences

**Good.** Overlap, DST, buffers, working hours, and deadlines are guaranteed by
code with tests, not by prompt quality. If the model is unavailable, rate
limited, or wrong, `rankSlotsHeuristically` still produces a sensible answer.
When the engine finds nothing, no model call is made at all.

**Costs.** More code than a single prompt. Preference nuance is constrained to
what the constraint schema can express, so genuinely novel requests need schema
changes rather than prompt changes. This is the right trade: schema changes are
reviewable.
