import type { SupabaseClient } from '@supabase/supabase-js';

import { EdgeError } from '../errors/index.ts';

/**
 * The durable queue, as the Edge runtime sees it.
 *
 * Nothing calls a provider straight from a request handler that has to return
 * quickly. A webhook enqueues and acknowledges; the worker does the work. That
 * is what makes a replay harmless and a failure visible instead of lost inside
 * a response that already returned 200.
 */

export const JOB_KINDS = {
  /** First import of a calendar: full window, then register the change channel. */
  calendarInitialSync: 'calendar.initial_sync',
  /** Everything since the stored cursor. */
  calendarSync: 'calendar.sync',
  /** Every imported calendar on one account — used by reconciliation. */
  accountSync: 'account.sync',
  /** Re-register a channel that is close to expiring. */
  watchRenew: 'watch.renew',
  /** Retry an outward write that failed after the user had moved on. */
  eventPush: 'event.push',
} as const;

export type JobKind = (typeof JOB_KINDS)[keyof typeof JOB_KINDS];

export interface SyncJob {
  id: string;
  user_id: string;
  provider_account_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  /** Fences completion so a reclaimed worker cannot close a newer claim. */
  claim_token: string;
}

export async function enqueue(
  admin: SupabaseClient,
  job: {
    userId: string;
    providerAccountId: string | null;
    kind: JobKind;
    payload?: Record<string, unknown>;
    /** Present for anything that can be delivered twice. */
    idempotencyKey?: string | null;
    runAfter?: Date;
  },
): Promise<string | null> {
  const { data, error } = await admin.rpc('enqueue_sync_job', {
    p_user_id: job.userId,
    p_provider_account_id: job.providerAccountId,
    p_kind: job.kind,
    p_payload: job.payload ?? {},
    p_idempotency_key: job.idempotencyKey ?? null,
    p_run_after: (job.runAfter ?? new Date()).toISOString(),
  });

  if (error) {
    console.error(JSON.stringify({ code: 'ENQUEUE_FAILED', kind: job.kind, detail: error.code }));
    throw new EdgeError('UNKNOWN', 'Could not schedule the sync.', 500);
  }

  // Null means the idempotency key already existed — the work is already
  // queued or already done, which is a success, not a collision.
  return (data as string | null) ?? null;
}

export async function claim(admin: SupabaseClient, limit: number): Promise<SyncJob[]> {
  const { data, error } = await admin.rpc('claim_sync_jobs', { p_limit: limit });

  if (error) {
    console.error(JSON.stringify({ code: 'CLAIM_FAILED', detail: error.code }));
    throw new EdgeError('UNKNOWN', 'Could not claim sync work.', 500);
  }

  return (data ?? []) as SyncJob[];
}

export async function complete(
  admin: SupabaseClient,
  jobId: string,
  succeeded: boolean,
  claimToken: string,
  error?: unknown,
): Promise<void> {
  // Only our own stable code is stored: `last_error` is readable by the job's
  // owner, and a provider message can quote an event title.
  const code = error instanceof EdgeError ? error.code : error ? 'UNKNOWN' : null;

  const { error: rpcError } = await admin.rpc('complete_sync_job', {
    p_job_id: jobId,
    p_succeeded: succeeded,
    p_claim_token: claimToken,
    p_error: code,
  });

  if (rpcError) {
    console.error(JSON.stringify({ code: 'COMPLETE_FAILED', detail: rpcError.code }));
  }
}

/**
 * A key that collapses repeated deliveries for the same calendar into one job.
 *
 * Google fires a notification per change, and a user pasting ten events into
 * their calendar produces ten deliveries within a second. Bucketing by minute
 * turns that into one sync run without ever delaying a change by more than the
 * bucket width.
 */
export function calendarSyncKey(calendarId: string, at = new Date()): string {
  const minute = Math.floor(at.getTime() / 60_000);
  return `calendar-sync:${calendarId}:${minute}`;
}

/**
 * A local calendar row has one durable first-sync job.
 *
 * The calendar id is generated again after a calendar is dropped and imported
 * again, so this key deduplicates concurrent imports without suppressing a
 * genuinely new import later.
 */
export function calendarInitialSyncKey(calendarId: string): string {
  return `calendar-initial-sync:${calendarId}`;
}
