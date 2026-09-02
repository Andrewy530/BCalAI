import { z } from 'zod';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { confirmAiScheduleSuggestion } from '../_shared/ai/confirmation.ts';
import { supabaseAiConfirmationRepository } from '../_shared/ai/confirmation-repository.ts';
import { supabaseFindTimeDataSource } from '../_shared/ai/find-time-repository.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';

const bodySchema = z.object({ suggestionId: z.string().uuid() }).strict();

/**
 * Sprint 6 Phase 4 endpoint: confirmation accepts only a persisted suggestion
 * id and delegates every scheduling write to the atomic server transaction.
 */
const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new EdgeError('VALIDATION_FAILED', 'Choose a saved scheduling suggestion.', 400);
  }

  const admin = adminClient();
  const result = await confirmAiScheduleSuggestion(
    { userId: user.id, suggestionId: parsed.data.suggestionId },
    {
      dataSource: supabaseFindTimeDataSource(admin),
      repository: supabaseAiConfirmationRepository(admin),
    },
  );

  return jsonResponse(result);
});

Deno.serve(handler);
