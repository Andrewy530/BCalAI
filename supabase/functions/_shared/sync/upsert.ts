import type { SupabaseClient } from '@supabase/supabase-js';

import { EdgeError } from '../errors/index.ts';
import type { NormalisedEvent } from '../providers/types.ts';

/**
 * Writing provider events into `events`.
 *
 * The unique index on `(provider_account_id, provider_event_id)` is what makes
 * this idempotent, so a replayed webhook delivery re-writes identical rows
 * instead of duplicating them.
 *
 * Note what is *not* here: this never writes outward. A provider event arriving
 * inward can only ever update the local copy, which is the structural reason a
 * webhook reflecting our own write cannot start a write loop.
 */

/** Postgres has a parameter ceiling; batches keep a large initial sync inside it. */
const BATCH_SIZE = 200;

export interface UpsertTarget {
  userId: string;
  calendarId: string;
  providerAccountId: string;
}

export interface UpsertOutcome {
  written: number;
  deleted: number;
  skippedPending: number;
}

export async function applyProviderEvents(
  admin: SupabaseClient,
  target: UpsertTarget,
  events: NormalisedEvent[],
  sourceType: 'google' | 'microsoft',
): Promise<UpsertOutcome> {
  if (events.length === 0) return { written: 0, deleted: 0, skippedPending: 0 };

  const tombstones = events.filter((event) => event.deleted || event.status === 'cancelled');
  const live = events.filter((event) => !event.deleted && event.status !== 'cancelled');

  const pending = await findPendingIds(admin, target.providerAccountId, events);

  // A row we are still trying to push must not be overwritten by an inbound
  // snapshot that predates that push — the user would watch their own edit
  // revert. The pending write completes, and the next sync converges.
  const writable = live.filter((event) => !pending.has(event.providerEventId));
  const removable = tombstones.filter((event) => !pending.has(event.providerEventId));

  let written = 0;
  for (let index = 0; index < writable.length; index += BATCH_SIZE) {
    const batch = writable.slice(index, index + BATCH_SIZE);
    const { error } = await admin.from('events').upsert(
      batch.map((event) => toRow(event, target, sourceType)),
      { onConflict: 'provider_account_id,provider_event_id' },
    );

    if (error) {
      console.error(JSON.stringify({ code: 'SYNC_UPSERT_FAILED', detail: error.code }));
      throw new EdgeError('UNKNOWN', 'Could not save synced events.', 500);
    }
    written += batch.length;
  }

  let deleted = 0;
  if (removable.length > 0) {
    // The provider is authoritative for these rows, so a removal there is a
    // removal here — keeping a cancelled shell would show the user an event
    // that no longer exists anywhere else.
    const { error, count } = await admin
      .from('events')
      .delete({ count: 'exact' })
      .eq('provider_account_id', target.providerAccountId)
      .in(
        'provider_event_id',
        removable.map((event) => event.providerEventId),
      );

    if (error) {
      console.error(JSON.stringify({ code: 'SYNC_DELETE_FAILED', detail: error.code }));
      throw new EdgeError('UNKNOWN', 'Could not remove deleted events.', 500);
    }
    deleted = count ?? removable.length;
  }

  return { written, deleted, skippedPending: pending.size };
}

function toRow(
  event: NormalisedEvent,
  target: UpsertTarget,
  sourceType: 'google' | 'microsoft',
): Record<string, unknown> {
  return {
    user_id: target.userId,
    calendar_id: target.calendarId,
    title: event.title,
    description: event.description,
    location: event.location,
    start_at: event.startAt,
    end_at: event.endAt,
    all_day: event.allDay,
    timezone: event.timezone,
    status: event.status,
    recurrence_rule: event.recurrenceRule,
    alerts: event.alerts,
    source_type: sourceType,
    provider_account_id: target.providerAccountId,
    provider_event_id: event.providerEventId,
    provider_etag: event.providerEtag,
    provider_updated_at: event.providerUpdatedAt,
    // Arriving from the provider *is* the definition of in sync. This is also
    // what confirms a row we pushed a moment ago, without a second write.
    sync_status: 'synced',
  };
}

async function findPendingIds(
  admin: SupabaseClient,
  providerAccountId: string,
  events: NormalisedEvent[],
): Promise<Set<string>> {
  const ids = events.map((event) => event.providerEventId);
  const pending = new Set<string>();

  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const { data, error } = await admin
      .from('events')
      .select('provider_event_id')
      .eq('provider_account_id', providerAccountId)
      .in('sync_status', ['pending', 'failed'])
      .in('provider_event_id', ids.slice(index, index + BATCH_SIZE));

    if (error) {
      console.error(JSON.stringify({ code: 'SYNC_PENDING_LOOKUP_FAILED', detail: error.code }));
      throw new EdgeError('UNKNOWN', 'Could not reconcile pending events.', 500);
    }

    for (const row of data ?? []) {
      if (row.provider_event_id) pending.add(row.provider_event_id as string);
    }
  }

  return pending;
}
