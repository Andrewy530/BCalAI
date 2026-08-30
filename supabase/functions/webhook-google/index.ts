import { adminClient } from '../_shared/auth/index.ts';
import { runAfterResponse } from '../_shared/http/background.ts';
import { JOB_KINDS, calendarSyncKey, enqueue } from '../_shared/sync/jobs.ts';
import { drainQueue } from '../_shared/sync/worker.ts';

/**
 * Google push notifications.
 *
 * Three rules govern this handler, all from `docs/sync-engine.md`:
 *
 * 1. **Acknowledge immediately.** Google treats a slow endpoint as a failed
 *    delivery and will back off the channel. Nothing here waits on a provider.
 * 2. **A webhook is a hint, not truth.** The body is ignored entirely; it says
 *    only "something changed", and the incremental sync is what discovers what.
 * 3. **Never 500.** A non-2xx teaches Google to stop delivering. Anything we
 *    cannot handle is logged and acknowledged, and the daily reconciliation
 *    catches whatever was missed.
 *
 * This function runs without a JWT — the caller is Google. The channel token,
 * generated when the channel was created and echoed on every delivery, is the
 * shared secret that authenticates it.
 */
Deno.serve(async (request: Request): Promise<Response> => {
  // Google verifies the endpoint with a GET before the first delivery.
  if (request.method === 'GET') return new Response('ok', { status: 200 });

  const channelId = request.headers.get('X-Goog-Channel-ID');
  const token = request.headers.get('X-Goog-Channel-Token');
  const resourceState = request.headers.get('X-Goog-Resource-State');

  // `sync` is the handshake Google sends when a channel is created. There is
  // nothing to fetch yet.
  if (resourceState === 'sync' || !channelId) {
    return new Response(null, { status: 200 });
  }

  try {
    const admin = adminClient();

    const { data: state } = await admin
      .from('calendar_sync_states')
      .select('id, calendar_id, webhook_token, provider_account_id')
      .eq('webhook_channel_id', channelId)
      .maybeSingle();

    // An unknown channel is usually one we stopped but Google has not yet
    // released. Acknowledge so it is not retried.
    if (!state?.calendar_id) {
      console.warn(JSON.stringify({ code: 'WEBHOOK_UNKNOWN_CHANNEL' }));
      return new Response(null, { status: 200 });
    }

    // Constant-time comparison is unnecessary here — a mismatch reveals nothing
    // beyond "wrong token" — but the check itself is essential: without it,
    // guessing a channel id would be enough to force syncs.
    if (!token || token !== state.webhook_token) {
      console.warn(JSON.stringify({ code: 'WEBHOOK_TOKEN_MISMATCH' }));
      return new Response(null, { status: 200 });
    }

    const { data: account } = await admin
      .from('provider_accounts')
      .select('user_id')
      .eq('id', state.provider_account_id)
      .maybeSingle();

    if (!account) return new Response(null, { status: 200 });

    await enqueue(admin, {
      userId: account.user_id as string,
      providerAccountId: state.provider_account_id as string,
      kind: JOB_KINDS.calendarSync,
      payload: { calendarId: state.calendar_id },
      // A burst of edits produces a burst of deliveries; this collapses them
      // into one sync per calendar per minute.
      idempotencyKey: calendarSyncKey(state.calendar_id as string),
    });

    runAfterResponse(() => drainQueue(admin, 5).then(() => undefined));

    return new Response(null, { status: 200 });
  } catch (error) {
    // Deliberately still a 200. Losing one notification costs us until the next
    // reconciliation; teaching Google to stop delivering costs us the channel.
    console.error(JSON.stringify({ code: 'WEBHOOK_FAILED', detail: String(error) }));
    return new Response(null, { status: 200 });
  }
});
