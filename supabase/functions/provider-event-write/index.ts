import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { loadAccount, resolveContext } from '../_shared/providers/accounts.ts';
import { JOB_KINDS, enqueue } from '../_shared/sync/jobs.ts';
import { pushEvent } from '../_shared/sync/push.ts';

/**
 * Push one edit of a provider-owned event outward.
 *
 * Synchronous rather than queued, because the user is looking at the editor and
 * needs to know whether their change landed. The queue is the *fallback*: a
 * transient provider failure schedules a retry so the edit is not lost, while
 * the response still tells the truth about what happened.
 *
 * Events on internal calendars never come here — the app writes those straight
 * to Postgres, where this database is the authority.
 */
const bodySchema = z.object({
  eventId: z.string().uuid(),
  operation: z.enum(['create', 'update', 'delete']),
});

const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Bad request.', 400);

  const admin = adminClient();

  const { data: event, error } = await admin
    .from('events')
    .select('id, provider_account_id, provider_event_id, calendar_id, calendars(provider_calendar_id)')
    .eq('id', parsed.data.eventId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read that event.', 500);
  if (!event) throw new EdgeError('NOT_FOUND', 'That event no longer exists.', 404);
  if (!event.provider_account_id) {
    throw new EdgeError('VALIDATION_FAILED', 'That event is not on a synced calendar.', 400);
  }

  const account = await loadAccount(admin, event.provider_account_id as string);
  if (account.user_id !== user.id) {
    throw new EdgeError('NOT_AUTHORIZED', 'That event is not yours.', 403);
  }

  const linked = event.calendars as unknown as { provider_calendar_id: string | null } | null;
  const ctx = await resolveContext(admin, account);

  try {
    const result = await pushEvent(admin, account, ctx, {
      eventId: event.id as string,
      operation: parsed.data.operation,
      providerCalendarId: linked?.provider_calendar_id ?? null,
      providerEventId: (event.provider_event_id as string | null) ?? null,
    });

    return jsonResponse({ ...result, syncStatus: 'synced' });
  } catch (cause) {
    const code = cause instanceof EdgeError ? cause.code : 'UNKNOWN';

    // A conflict or a refusal will not resolve itself, so only transient
    // failures are worth a retry. Queuing the rest would keep an event stuck
    // in `failed` while the queue quietly rediscovered the same rejection.
    if (isTransient(code)) {
      await enqueue(admin, {
        userId: user.id,
        providerAccountId: account.id,
        kind: JOB_KINDS.eventPush,
        payload: {
          eventId: event.id,
          operation: parsed.data.operation,
          providerCalendarId: linked?.provider_calendar_id ?? null,
          providerEventId: event.provider_event_id ?? null,
        },
        runAfter: new Date(Date.now() + 30_000),
      });
    }

    throw cause;
  }
});

function isTransient(code: string): boolean {
  return code === 'PROVIDER_RATE_LIMITED' || code === 'NETWORK_UNAVAILABLE' || code === 'UNKNOWN';
}

Deno.serve(handler);
