import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { loadAccount, resolveContext } from '../_shared/providers/accounts.ts';
import { providerFor } from '../_shared/providers/registry.ts';

/**
 * The calendars a connected account offers, and which of them are imported.
 *
 * This is a provider read rather than a database read on purpose: the picker
 * has to show calendars the user has *not* imported yet, and those exist only
 * on the provider's side.
 */
const bodySchema = z.object({ providerAccountId: z.string().uuid() });

const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const input = parse(await request.json().catch(() => null));

  const admin = adminClient();
  const account = await loadAccount(admin, input.providerAccountId);

  // Service-role reads bypass RLS, so ownership is checked explicitly here.
  if (account.user_id !== user.id) {
    throw new EdgeError('NOT_AUTHORIZED', 'That connection is not yours.', 403);
  }

  const ctx = await resolveContext(admin, account);
  const calendars = await providerFor(account.provider).listCalendars(ctx);

  const { data: imported, error } = await admin
    .from('calendars')
    .select('id, provider_calendar_id, is_visible')
    .eq('provider_account_id', account.id);

  if (error) throw new EdgeError('UNKNOWN', 'Could not read imported calendars.', 500);

  const importedBy = new Map(
    (imported ?? []).map((row) => [row.provider_calendar_id as string, row]),
  );

  return jsonResponse({
    calendars: calendars.map((calendar) => {
      const local = importedBy.get(calendar.providerCalendarId);
      return {
        ...calendar,
        isImported: Boolean(local),
        calendarId: local?.id ?? null,
        isVisible: local?.is_visible ?? true,
      };
    }),
  });
});

function parse(body: unknown) {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Pick a connection.', 400);
  return parsed.data;
}

Deno.serve(handler);
