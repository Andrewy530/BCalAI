import { aiScheduleRequestSchema } from '@cal/schemas/scheduling';

import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { prepareDeterministicFindTime } from '../_shared/ai/find-time.ts';
import { supabaseFindTimeDataSource } from '../_shared/ai/find-time-repository.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';

/**
 * Sprint 6 Phase 1 endpoint: authenticated, entitlement-gated deterministic
 * candidate generation only. No model is called and no proposal is persisted
 * until the Phase 2/3 provider and production-request slices are implemented.
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

  const result = await prepareDeterministicFindTime(
    { userId: user.id, request: parsed.data },
    supabaseFindTimeDataSource(admin),
  );

  return jsonResponse({
    status: 'candidates',
    task: {
      id: result.task.id,
      durationMinutes: result.task.durationMinutes,
      deadlineAt: result.task.deadlineAt,
      version: result.task.version,
    },
    targetCalendar: result.targetCalendar,
    constraints: result.constraints,
    candidates: result.candidates,
  });
});

Deno.serve(handler);
