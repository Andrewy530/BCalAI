# 0002 — Supabase as the backend

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

The data is thoroughly relational: users own calendars, calendars contain
events, lists contain tasks, tasks produce time blocks, provider accounts own
sync cursors, users hold entitlements. We also need OAuth callbacks, provider
webhooks, scheduled reconciliation, and encrypted credential storage — without
running infrastructure.

## Decision

Supabase: Postgres with Row Level Security, Supabase Auth, Edge Functions, Cron,
and Vault.

## Consequences

**Good.** Postgres constraints express the invariants that actually matter
(no backwards events, one default calendar, unique provider event ids) so
correctness does not depend on every code path being careful. RLS puts
authorisation next to the data. Edge Functions give a place for secrets the
client must never see. Cron covers the reconciliation that webhooks alone cannot.

**Costs.** RLS is easy to get subtly wrong and its failures are silent, so
pgTAP tests run in CI on every PR. Edge Functions run on Deno, which is a
second runtime with its own dependency story. Vendor lock-in is real, though
Postgres itself is portable.

## Consequences we accept deliberately

- Never disable RLS for convenience.
- The service-role key never enters the mobile bundle.
- Provider refresh tokens are never stored in AsyncStorage.
