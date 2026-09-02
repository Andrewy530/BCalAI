import { aiScheduleRequestSchema } from '@cal/schemas/scheduling';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { createOpenAiRankingProvider, openAiRankingConfigFromEnv } from '../_shared/ai/openai.ts';
import { supabaseFindTimeDataSource } from '../_shared/ai/find-time-repository.ts';
import { generateAiFindTimeProposal } from '../_shared/ai/proposal.ts';
import { supabaseAiScheduleRepository } from '../_shared/ai/proposal-repository.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';

/**
 * Sprint 6 Phase 3 endpoint: deterministic candidate generation remains the
 * availability authority; the configured provider may only rank those slots.
 */
const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

  const user = await requireUser(request);
  const parsed = aiScheduleRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new EdgeError('VALIDATION_FAILED', 'Bad scheduling request.', 400);

  const admin = adminClient();
  const { data: entitled, error: entitlementError } = await admin.rpc('has_active_entitlement', {
    p_user_id: user.id,
    p_entitlement: 'pro',
  });
  if (entitlementError) {
    throw new EdgeError('UNKNOWN', 'Could not verify your subscription.', 500);
  }
  if (!entitled) {
    throw new EdgeError('SUBSCRIPTION_REQUIRED', 'Find Time requires Pro.', 403);
  }

  return jsonResponse(
    await generateAiFindTimeProposal(
      { userId: user.id, request: parsed.data },
      {
        dataSource: supabaseFindTimeDataSource(admin),
        repository: supabaseAiScheduleRepository(admin),
        // The factory is intentionally lazy: a no-slot response must not read
        // provider configuration or make a model request.
        createProvider: () => createOpenAiRankingProvider(openAiRankingConfigFromEnv()),
      },
    ),
  );
});

Deno.serve(handler);
