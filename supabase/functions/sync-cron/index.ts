import { adminClient } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse } from '../_shared/http/cors.ts';
import { JOB_KINDS, enqueue } from '../_shared/sync/jobs.ts';
import { drainQueue } from '../_shared/sync/worker.ts';

/**
 * The scheduled half of the sync engine.
 *
 * Webhooks are an optimisation; these four tasks are what make the system
 * actually converge (`docs/sync-engine.md` § Reliability). Each is idempotent
 * and each is safe to run more often than scheduled.
 *
 * Authenticated by a shared secret rather than a user JWT, because the caller
 * is `pg_cron`, not a person. Without `SYNC_CRON_SECRET` set, the function
 * refuses to run at all — an open endpoint that drains a job queue is worse
 * than a schedule that never fires.
 */
type Task = 'renew-watches' | 'retry-failed' | 'reconcile' | 'prune';

const handler = withErrorHandling(async (request) => {
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  requireCronSecret(request);

  const task = (new URL(request.url).searchParams.get('task') ?? 'retry-failed') as Task;
  const admin = adminClient();

  switch (task) {
    case 'renew-watches':
      return jsonResponse(await renewWatches(admin));
    case 'reconcile':
      return jsonResponse(await reconcile(admin));
    case 'prune':
      return jsonResponse(await prune(admin));
    case 'retry-failed':
      return jsonResponse(await drainQueue(admin, 25));
    default:
      throw new EdgeError('VALIDATION_FAILED', 'Unknown task.', 400);
  }
});

/**
 * Recreate channels before they lapse.
 *
 * The window is generous on purpose: a channel that expires unnoticed means
 * silent staleness until the next daily reconciliation, so it is renewed with
 * two days to spare and several hourly attempts in hand.
 */
async function renewWatches(admin: ReturnType<typeof adminClient>) {
  const threshold = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: states, error } = await admin
    .from('calendar_sync_states')
    .select('calendar_id, provider_account_id, provider_accounts!inner(user_id, status)')
    .lt('webhook_expires_at', threshold)
    .not('calendar_id', 'is', null)
    .limit(100);

  if (error) throw new EdgeError('UNKNOWN', 'Could not list expiring channels.', 500);

  let queued = 0;
  for (const state of states ?? []) {
    const account = state.provider_accounts as unknown as { user_id: string; status: string };
    // No point renewing a channel for a connection the user must re-authorise.
    if (account.status !== 'active') continue;

    await enqueue(admin, {
      userId: account.user_id,
      providerAccountId: state.provider_account_id as string,
      kind: JOB_KINDS.watchRenew,
      payload: { calendarId: state.calendar_id },
      idempotencyKey: `watch-renew:${state.calendar_id}:${new Date().toISOString().slice(0, 13)}`,
    });
    queued += 1;
  }

  const summary = await drainQueue(admin, 25);
  return { task: 'renew-watches', queued, ...summary };
}

/** A full pass per connection, in case a notification was never delivered. */
async function reconcile(admin: ReturnType<typeof adminClient>) {
  const { data: accounts, error } = await admin
    .from('provider_accounts')
    .select('id, user_id')
    .eq('status', 'active')
    .limit(500);

  if (error) throw new EdgeError('UNKNOWN', 'Could not list connections.', 500);

  let queued = 0;
  for (const account of accounts ?? []) {
    await enqueue(admin, {
      userId: account.user_id as string,
      providerAccountId: account.id as string,
      kind: JOB_KINDS.accountSync,
      // One reconciliation per account per day, however often this runs.
      idempotencyKey: `reconcile:${account.id}:${new Date().toISOString().slice(0, 10)}`,
    });
    queued += 1;
  }

  // Reconciliation is the least urgent work in the queue, so it is left for the
  // retry-failed schedule to drain rather than done here.
  return { task: 'reconcile', queued };
}

async function prune(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.rpc('prune_sync_history');
  if (error) throw new EdgeError('UNKNOWN', 'Could not prune sync history.', 500);
  return { task: 'prune', deleted: data ?? 0 };
}

function requireCronSecret(request: Request): void {
  const expected = Deno.env.get('SYNC_CRON_SECRET');
  if (!expected) {
    console.error(JSON.stringify({ code: 'CRON_SECRET_MISSING' }));
    throw new EdgeError('NOT_AUTHORIZED', 'Scheduled sync is not configured.', 503);
  }

  if (request.headers.get('X-Sync-Cron-Secret') !== expected) {
    throw new EdgeError('NOT_AUTHORIZED', 'Not allowed.', 403);
  }
}

Deno.serve(handler);
