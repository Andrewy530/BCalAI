import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { loadAccount, resolveContext } from '../_shared/providers/accounts.ts';
import { JOB_KINDS, enqueue } from '../_shared/sync/jobs.ts';
import { eventDraftSchema, pushEvent, type PushRequest } from '../_shared/sync/push.ts';

/**
 * Create, update, or delete an event on a synced calendar.
 *
 * The draft comes here rather than being written to Postgres first, because the
 * provider is the authority for these rows and has to accept the change before
 * a local copy means anything (`docs/sync-engine.md` § Writes).
 *
 * Synchronous rather than queued: the user is looking at the editor and needs
 * to know whether their change landed. The queue is the fallback for a
 * transient provider failure, so the edit is not lost while the response still
 * tells the truth about what happened.
 *
 * Events on internal calendars never come here — the app writes those straight
 * to Postgres, where this database is the authority.
 */
const bodySchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create'),
    calendarId: z.string().uuid(),
    draft: eventDraftSchema,
  }),
  z.object({
    operation: z.literal('update'),
    eventId: z.string().uuid(),
    draft: eventDraftSchema,
  }),
  z.object({
    operation: z.literal('delete'),
    eventId: z.string().uuid(),
  }),
]);

const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Bad request.', 400);
  const input = parsed.data;

  const admin = adminClient();

  // Ownership is resolved from the row, never from the request body.
  const providerAccountId =
    input.operation === 'create'
      ? await accountForCalendar(admin, input.calendarId, user.id)
      : await accountForEvent(admin, input.eventId, user.id);

  const account = await loadAccount(admin, providerAccountId);
  if (account.user_id !== user.id) {
    throw new EdgeError('NOT_AUTHORIZED', 'That calendar is not yours.', 403);
  }

  const ctx = await resolveContext(admin, account);

  try {
    const result = await pushEvent(admin, account, ctx, input as PushRequest);
    return jsonResponse({ ...result, syncStatus: 'synced' });
  } catch (cause) {
    const code = cause instanceof EdgeError ? cause.code : 'UNKNOWN';

    // Only a transient failure is worth retrying. Queuing a conflict or a
    // refusal would keep the row stuck while the queue rediscovered the same
    // rejection five times. A create is not retried either: without a local
    // row there is nothing to reconcile against, and a blind retry risks a
    // duplicate event in the user's real calendar.
    if (input.operation !== 'create' && isTransient(code)) {
      await enqueue(admin, {
        userId: user.id,
        providerAccountId: account.id,
        kind: JOB_KINDS.eventPush,
        payload: { ...input },
        runAfter: new Date(Date.now() + 30_000),
      });
    }

    throw cause;
  }
});

async function accountForCalendar(
  admin: ReturnType<typeof adminClient>,
  calendarId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('calendars')
    .select('provider_account_id')
    .eq('id', calendarId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read that calendar.', 500);
  if (!data?.provider_account_id) {
    throw new EdgeError('VALIDATION_FAILED', 'That calendar is not a synced calendar.', 400);
  }
  return data.provider_account_id as string;
}

async function accountForEvent(
  admin: ReturnType<typeof adminClient>,
  eventId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('events')
    .select('provider_account_id')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new EdgeError('UNKNOWN', 'Could not read that event.', 500);
  if (!data) throw new EdgeError('NOT_FOUND', 'That event no longer exists.', 404);
  if (!data.provider_account_id) {
    throw new EdgeError('VALIDATION_FAILED', 'That event is not on a synced calendar.', 400);
  }
  return data.provider_account_id as string;
}

function isTransient(code: string): boolean {
  return code === 'PROVIDER_RATE_LIMITED' || code === 'NETWORK_UNAVAILABLE' || code === 'UNKNOWN';
}

Deno.serve(handler);
