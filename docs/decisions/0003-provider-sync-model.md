# 0003 — Provider sync model

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Google and Microsoft both own calendar data that this app displays and edits.
Two things can go wrong and both are severe: showing a user a calendar that
disagrees with their real one, and writing a change back that the provider then
echoes into an infinite loop.

## Decision

1. **The provider owns its events.** This database holds a normalised copy,
   marked by `events.source_type`.
2. **Write to the provider first**, then update the local copy.
3. **Cursors, not polling.** Google `syncToken` and Microsoft delta state both
   live in `calendar_sync_states.sync_cursor`.
4. **Webhooks are hints.** They enqueue a job and return immediately; the actual
   sync is a cursor-driven incremental fetch.
5. **Idempotent upserts** keyed on `(provider_account_id, provider_event_id)`.
6. **Periodic reconciliation** via Cron, because push delivery is documented as
   unreliable on both platforms.
7. **Read sync ships first**, and writes are enabled only after it is validated.

## Consequences

**Good.** A replayed or duplicated webhook is harmless. A missed one is
corrected within a day. A failed sync is visible in `sync_jobs` rather than
silently lost. Provider-specific code stays behind one adapter interface, so
adding a third provider does not touch the app.

**Costs.** More moving parts than a naive poll — a job queue, renewal jobs, and
reconciliation. Write-through means an offline edit to a provider event has to
queue rather than apply instantly; the UI must show that honestly.

## Alternatives

- **Local-first with CRDT merge.** Overkill before product validation, and the
  providers are not CRDT-shaped anyway.
- **Poll every N minutes.** Simpler, but either slow to reflect changes or
  wasteful of quota, and it still needs the same normalisation layer.
