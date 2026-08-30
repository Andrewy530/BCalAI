import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { loadAccount } from '../_shared/providers/accounts.ts';
import { releaseProviderGrant } from '../_shared/providers/disconnect.ts';

/**
 * Disconnect a provider account.
 *
 * Order matters and is the reverse of connecting: stop the channels while we
 * still have a token, revoke the grant at the provider, delete the secret, and
 * only then delete our own row — so we never end up holding a live OAuth grant
 * with no record of it, which is the one outcome that cannot be cleaned up
 * later.
 *
 * Every provider-side step is best-effort. A user asking to disconnect must
 * always end up disconnected locally, even when the provider is unreachable.
 */
const bodySchema = z.object({ providerAccountId: z.string().uuid() });

const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Pick a connection.', 400);

  const admin = adminClient();
  const account = await loadAccount(admin, parsed.data.providerAccountId);
  if (account.user_id !== user.id) {
    throw new EdgeError('NOT_AUTHORIZED', 'That connection is not yours.', 403);
  }

  await releaseProviderGrant(admin, account.id);

  // Cascades remove the imported calendars, their events, sync state, and jobs.
  const { error } = await admin.from('provider_accounts').delete().eq('id', account.id);
  if (error) throw new EdgeError('UNKNOWN', 'Could not disconnect that account.', 500);

  console.log(
    JSON.stringify({ event: 'provider_disconnected', provider: account.provider, userId: user.id }),
  );

  return jsonResponse({ disconnected: true });
});

Deno.serve(handler);
