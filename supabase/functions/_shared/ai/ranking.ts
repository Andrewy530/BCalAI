import { getZonedParts, toZonedDateKey } from '@cal/domain/time';
import {
  aiRankCandidateSlotsInputSchema,
  aiScheduleProposalSchema,
  type AiRankCandidateSlotsInput,
  type AiScheduleProposal,
} from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';
import type { DeterministicFindTimeResult } from './find-time.ts';

export const AI_PROMPT_VERSION = 'find-time-ranker-v1';
export const MAX_MODEL_CANDIDATES = 40;

export interface AiRankingUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

export interface AiRankingMetadata {
  provider: string;
  model: string;
  responseId: string | null;
  promptVersion: string;
  latencyMs: number;
  usage: AiRankingUsage;
}

export interface AiRankingResult {
  proposal: AiScheduleProposal;
  metadata: AiRankingMetadata;
}

export interface AiRankingProvider {
  readonly provider: string;
  readonly model: string;
  rankCandidateSlots(input: AiRankCandidateSlotsInput): Promise<AiRankingResult>;
}

/** Build the only context an AI provider is allowed to receive. */
export function buildAiRankingInput(
  result: DeterministicFindTimeResult,
): AiRankCandidateSlotsInput {
  const shortlisted = evenlySpacedShortlist(result.candidates, MAX_MODEL_CANDIDATES);
  const input = {
    task: {
      title: result.task.title,
      priority: result.task.priority,
      durationMinutes: result.task.durationMinutes,
      deadlineAt: result.task.deadlineAt,
    },
    note: result.note,
    timezone: result.constraints.timezone,
    preferredTimeOfDay: result.constraints.preferredTimeOfDay,
    candidates: shortlisted.map((candidate) => {
      const start = new Date(candidate.startAt);
      const end = new Date(candidate.endAt);
      const startParts = getZonedParts(start, result.constraints.timezone);
      const endDate = toZonedDateKey(end, result.constraints.timezone);
      const localDate = toZonedDateKey(start, result.constraints.timezone);

      return {
        id: candidate.id,
        startAt: candidate.startAt,
        endAt: candidate.endAt,
        localDate,
        localStartMinute: startParts.hour * 60 + startParts.minute,
        localEndMinute:
          endDate === localDate
            ? getZonedParts(end, result.constraints.timezone).hour * 60 +
              getZonedParts(end, result.constraints.timezone).minute
            : 24 * 60,
        minutesFromPreviousBusy: candidate.minutesFromPreviousBusy,
        minutesUntilNextBusy: candidate.minutesUntilNextBusy,
      };
    }),
  };

  const parsed = aiRankCandidateSlotsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new EdgeError('UNKNOWN', 'Could not prepare safe AI ranking context.', 500);
  }
  return parsed.data;
}

/**
 * Apply repository validation after provider-level Structured Outputs. This is
 * the final structural guard that prevents invented timestamps or slot ids.
 */
export function validateAiRankingProposal(
  value: unknown,
  candidates: readonly { id: string }[],
): AiScheduleProposal {
  const parsed = aiScheduleProposalSchema.safeParse(value);
  if (!parsed.success) {
    throw new EdgeError(
      'AI_INVALID_OUTPUT',
      'The AI returned an invalid scheduling proposal.',
      502,
    );
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  if (parsed.data.suggestions.some((suggestion) => !candidateIds.has(suggestion.slotId))) {
    throw new EdgeError('AI_INVALID_OUTPUT', 'The AI selected an unknown candidate.', 502);
  }

  return parsed.data;
}

function evenlySpacedShortlist<T>(candidates: readonly T[], limit: number): T[] {
  if (candidates.length <= limit) return [...candidates];

  const selected: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    const candidateIndex = Math.floor((index * (candidates.length - 1)) / (limit - 1));
    const candidate = candidates[candidateIndex];
    if (candidate !== undefined) selected.push(candidate);
  }
  return selected;
}
