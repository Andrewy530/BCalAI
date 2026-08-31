import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { EdgeError } from '../errors/index.ts';
import { loadAccount, markAccount, resolveContext } from '../providers/accounts.ts';
import type { ProviderContext } from '../providers/types.ts';

import {
  ensureWatch,
  loadSyncState,
  loadSyncStateByCalendar,
  recordSyncFailure,
  syncCalendar,
} from './engine.ts';
import { JOB_KINDS, claim, complete, type SyncJob } from './jobs.ts';
import { eventDraftSchema, pushEvent, type PushRequest } from './push.ts';

/**
 * The one consumer of `sync_jobs`.
 *
 * Every job kind is dispatched here, and every job ends in exactly one call to
 * `complete` — success or failure — so a claimed job can never be left in
 * `running` for a worker that has already exited.
 */

/** Keeps one invocation inside the CPU budget even when the queue is deep. */
const DEFAULT_BATCH = 10;

export interface DrainSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

export async function drainQueue(
  admin: SupabaseClient,
  limit = DEFAULT_BATCH,
): Promise<DrainSummary> {
  const jobs = await claim(admin, limit);
  const summary: DrainSummary = { claimed: jobs.length, succeeded: 0, failed: 0 };

  // Access tokens are resolved once per account rather than once per job: a
  // reconciliation run can hold a dozen jobs for the same connection.
  const contexts = new Map<string, ProviderContext>();

  for (const job of jobs) {
    try {
      await runJob(admin, job, contexts);
      await complete(admin, job.id, true);
      summary.succeeded += 1;
    } catch (error) {
      const code = error instanceof EdgeError ? error.code : 'UNKNOWN';
      console.error(
        JSON.stringify({ code: 'SYNC_JOB_FAILED', kind: job.kind, reason: code, jobId: job.id }),
      );
      await complete(admin, job.id, false, error);
      summary.failed += 1;
    }
  }

  return summary;
}

async function runJob(
  admin: SupabaseClient,
  job: SyncJob,
  contexts: Map<string, ProviderContext>,
): Promise<void> {
  if (!job.provider_account_id) {
    throw new EdgeError('VALIDATION_FAILED', 'Job has no connection.', 400);
  }

  const account = await loadAccount(admin, job.provider_account_id);

  // A revoked connection cannot be repaired by retrying. Fail fast so the job
  // exhausts its attempts quickly and the user sees a reconnect prompt.
  if (account.status === 'revoked') {
    throw new EdgeError('GOOGLE_AUTH_EXPIRED', 'That connection was revoked.', 401);
  }

  let ctx = contexts.get(account.id);
  if (!ctx) {
    ctx = await resolveContext(admin, account);
    contexts.set(account.id, ctx);
  }

  switch (job.kind) {
    case JOB_KINDS.calendarInitialSync:
    case JOB_KINDS.calendarSync: {
      const state = await requireStateForCalendar(admin, job);
      try {
        await syncCalendar(admin, account, ctx, state);
      } catch (error) {
        await recordSyncFailure(admin, state, error);
        throw error;
      }
      if (job.kind === JOB_KINDS.calendarInitialSync) {
        await ensureWatch(admin, account, ctx, state);
      }
      return;
    }

    case JOB_KINDS.watchRenew: {
      const state = await requireStateForCalendar(admin, job);
      const renewed = await ensureWatch(admin, account, ctx, state);
      if (!renewed) throw new EdgeError('UNKNOWN', 'Could not renew the change channel.', 502);
      return;
    }

    case JOB_KINDS.accountSync: {
      // Reconciliation: every imported calendar on the account, in one job, so
      // a missed notification anywhere is caught by a single daily schedule.
      const { data: calendars, error } = await admin
        .from('calendars')
        .select('provider_calendar_id')
        .eq('provider_account_id', account.id);

      if (error) throw new EdgeError('UNKNOWN', 'Could not list calendars.', 500);

      for (const row of calendars ?? []) {
        const state = await loadSyncState(admin, account.id, row.provider_calendar_id as string);
        if (!state?.calendar_id) continue;

        try {
          await syncCalendar(admin, account, ctx, state);
        } catch (error) {
          // One failing calendar must not abandon the rest of the account.
          await recordSyncFailure(admin, state, error);
          console.error(
            JSON.stringify({
              code: 'RECONCILE_CALENDAR_FAILED',
              calendarId: state.calendar_id,
              reason: error instanceof EdgeError ? error.code : 'UNKNOWN',
            }),
          );
        }
      }
      return;
    }

    case JOB_KINDS.eventPush: {
      // The payload was validated when it was enqueued, but it has been through
      // jsonb since — so it is external input again by the time it gets here.
      await pushEvent(admin, account, ctx, parsePushPayload(job.payload));
      return;
    }

    default:
      // An unknown kind is a deploy skew, not a transient fault. Marking the
      // account keeps it visible rather than letting the job retry silently.
      await markAccount(admin, account.id, 'error', 'Unrecognised sync task.');
      throw new EdgeError('VALIDATION_FAILED', `Unknown job kind ${job.kind}.`, 400);
  }
}

async function requireStateForCalendar(admin: SupabaseClient, job: SyncJob) {
  const calendarId = job.payload.calendarId;
  if (typeof calendarId !== 'string') {
    throw new EdgeError('VALIDATION_FAILED', 'Job is missing a calendar.', 400);
  }

  const state = await loadSyncStateByCalendar(admin, calendarId);
  if (!state) {
    // The calendar was dropped between enqueue and drain. Nothing to do, and
    // nothing wrong — but the job must not retry forever, so it fails once and
    // its idempotency key stops the webhook from re-queuing it.
    throw new EdgeError('NOT_FOUND', 'That calendar is no longer imported.', 404);
  }
  return state;
}

/** Only retryable operations are ever enqueued; a create never is. */
const pushPayloadSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('update'),
    eventId: z.string().uuid(),
    draft: eventDraftSchema,
  }),
  z.object({ operation: z.literal('delete'), eventId: z.string().uuid() }),
]);

function parsePushPayload(payload: Record<string, unknown>): PushRequest {
  const parsed = pushPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new EdgeError('VALIDATION_FAILED', 'Unusable push job.', 400);
  }
  return parsed.data;
}
