import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { JOB_KINDS, calendarSyncKey, enqueue } from '../_shared/sync/jobs.ts';
import { drainQueue } from '../_shared/sync/worker.ts';

/**
 * "Sync now."
 *
 * The manual counterpart to the webhook: pull-to-refresh on the calendar, or a
 * user who has just fixed a reconnect prompt. It queues the work and drains the
 * queue in the same request, because the user is watching and the batch is
 * bounded.
 *
 * The same idempotency key as the webhook is used, so hammering refresh cannot
 * multiply the work.
 */
const bodySchema = z.object({
  /** Omit to sync everything the caller has connected. */
  calendarId: z.string().uuid().nullish(),
});

const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Bad request.', 400);

  const admin = adminClient();

  // Ownership comes from the query, not the request: only calendars belonging
  // to the caller can be selected here, so a forged id finds nothing.
  const query = admin
    .from('calendars')
    .select('id, provider_account_id')
    .eq('user_id', user.id)
    .not('provider_account_id', 'is', null);

  const { data: calendars, error } = parsed.data.calendarId
    ? await query.eq('id', parsed.data.calendarId)
    : await query;

  if (error) throw new EdgeError('UNKNOWN', 'Could not read your calendars.', 500);

  for (const calendar of calendars ?? []) {
    await enqueue(admin, {
      userId: user.id,
      providerAccountId: calendar.provider_account_id as string,
      kind: JOB_KINDS.calendarSync,
      payload: { calendarId: calendar.id },
      idempotencyKey: calendarSyncKey(calendar.id as string),
    });
  }

  const summary = await drainQueue(admin, 10);

  return jsonResponse({ queued: calendars?.length ?? 0, ...summary });
});

Deno.serve(handler);
