import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { ScheduleConstraints } from '@cal/schemas/scheduling';

import { EdgeError, type EdgeErrorCode } from '../errors/index.ts';

const uuidSchema = z.string().uuid();

export interface AiRequestSnapshot {
  taskId: string;
  targetCalendarId: string;
  taskVersion: string;
  profileVersion: string;
  targetCalendarVersion: string;
  constraints: ScheduleConstraints;
  candidateCount: number;
}

export interface AiSuggestionToPersist {
  slotId: string;
  startAt: string;
  endAt: string;
  rank: number;
  score: number;
  reason: string;
}

export interface PersistedAiSuggestion extends AiSuggestionToPersist {
  id: string;
}

export interface AiRequestUpdate {
  status?: 'pending' | 'proposed' | 'failed';
  constraints?: ScheduleConstraints;
  targetCalendarId?: string;
  taskVersion?: string;
  profileVersion?: string;
  targetCalendarVersion?: string;
  candidateCount?: number;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  errorCode?: EdgeErrorCode | null;
  completedAt?: string | null;
}

export interface AiScheduleRepository {
  /** Returns null when the atomic per-user attempt limit is exhausted. */
  claimRatedRequest(userId: string, taskId: string): Promise<string | null>;
  updateRequest(userId: string, requestId: string, patch: AiRequestUpdate): Promise<void>;
  insertSuggestions(
    requestId: string,
    suggestions: readonly AiSuggestionToPersist[],
  ): Promise<PersistedAiSuggestion[]>;
}

export function supabaseAiScheduleRepository(admin: SupabaseClient): AiScheduleRepository {
  return {
    async claimRatedRequest(userId, taskId) {
      const { data, error } = await admin.rpc('claim_ai_schedule_request', {
        p_user_id: userId,
        p_task_id: taskId,
      });
      if (error) throw persistenceError('claim', error.code);
      if (data === null) return null;

      const parsed = uuidSchema.safeParse(data);
      if (!parsed.success) throw persistenceError('claim', 'invalid_request_id');
      return parsed.data;
    },

    async updateRequest(userId, requestId, patch) {
      const payload: Record<string, unknown> = {};
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.constraints !== undefined) payload.constraints = patch.constraints;
      if (patch.targetCalendarId !== undefined) {
        payload.target_calendar_id = patch.targetCalendarId;
      }
      if (patch.taskVersion !== undefined) payload.task_version = patch.taskVersion;
      if (patch.profileVersion !== undefined) payload.profile_version = patch.profileVersion;
      if (patch.targetCalendarVersion !== undefined) {
        payload.target_calendar_version = patch.targetCalendarVersion;
      }
      if (patch.candidateCount !== undefined) payload.candidate_count = patch.candidateCount;
      if (patch.provider !== undefined) payload.provider = patch.provider;
      if (patch.model !== undefined) payload.model = patch.model;
      if (patch.promptVersion !== undefined) payload.prompt_version = patch.promptVersion;
      if (patch.latencyMs !== undefined) payload.latency_ms = patch.latencyMs;
      if (patch.inputTokens !== undefined) payload.input_tokens = patch.inputTokens;
      if (patch.outputTokens !== undefined) payload.output_tokens = patch.outputTokens;
      if (patch.reasoningTokens !== undefined) payload.reasoning_tokens = patch.reasoningTokens;
      if (patch.totalTokens !== undefined) payload.total_tokens = patch.totalTokens;
      if (patch.errorCode !== undefined) payload.error_code = patch.errorCode;
      if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt;
      if (Object.keys(payload).length === 0) return;

      const { error } = await admin
        .from('ai_schedule_requests')
        .update(payload)
        .eq('id', requestId)
        .eq('user_id', userId);
      if (error) throw persistenceError('update', error.code);
    },

    async insertSuggestions(requestId, suggestions) {
      const { data, error } = await admin
        .from('ai_schedule_suggestions')
        .insert(
          suggestions.map((suggestion) => ({
            request_id: requestId,
            slot_id: suggestion.slotId,
            start_at: suggestion.startAt,
            end_at: suggestion.endAt,
            rank: suggestion.rank,
            score: suggestion.score,
            reason: suggestion.reason,
          })),
        )
        .select('id, slot_id, start_at, end_at, rank, score, reason')
        .order('rank');
      if (error) throw persistenceError('insert_suggestions', error.code);

      const parsed = z
        .array(
          z.object({
            id: uuidSchema,
            slot_id: z.string().min(1),
            start_at: z.string().min(1),
            end_at: z.string().min(1),
            rank: z.coerce.number().int().min(1).max(5),
            score: z.coerce.number().min(0).max(1),
            reason: z.string().min(1).max(280),
          }),
        )
        .safeParse(data ?? []);
      if (!parsed.success || parsed.data.length !== suggestions.length) {
        throw persistenceError('insert_suggestions', 'invalid_rows');
      }

      return parsed.data.map((row) => ({
        id: row.id,
        slotId: row.slot_id,
        startAt: row.start_at,
        endAt: row.end_at,
        rank: row.rank,
        score: row.score,
        reason: row.reason,
      }));
    },
  };
}

function persistenceError(operation: string, detail: string | undefined): EdgeError {
  console.error(JSON.stringify({ code: 'AI_REQUEST_PERSISTENCE_FAILED', operation, detail }));
  return new EdgeError('UNKNOWN', 'Could not save the Find Time request.', 500);
}
