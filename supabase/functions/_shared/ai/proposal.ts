import type { AiScheduleRequest, ScheduleConstraints } from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';
import {
  prepareDeterministicFindTime,
  type CandidateIdFactory,
  type DeterministicFindTimeResult,
  type FindTimeDataSource,
} from './find-time.ts';
import {
  buildAiRankingInput,
  validateAiRankingProposal,
  type AiRankingProvider,
} from './ranking.ts';
import {
  type AiRequestSnapshot,
  type AiScheduleRepository,
  type AiSuggestionToPersist,
  type PersistedAiSuggestion,
} from './proposal-repository.ts';

export interface AiFindTimeProposal {
  status: 'proposed';
  requestId: string;
  task: {
    id: string;
    durationMinutes: number;
    deadlineAt: string | null;
    version: string;
  };
  targetCalendar: DeterministicFindTimeResult['targetCalendar'];
  constraints: ScheduleConstraints;
  suggestions: PersistedAiSuggestion[];
}

export interface GenerateAiFindTimeProposalDeps {
  dataSource: FindTimeDataSource;
  repository: AiScheduleRepository;
  createProvider: () => AiRankingProvider;
  candidateIdFactory?: CandidateIdFactory;
  clock?: () => Date;
}

export async function generateAiFindTimeProposal(
  input: { userId: string; request: AiScheduleRequest; now?: Date },
  deps: GenerateAiFindTimeProposalDeps,
): Promise<AiFindTimeProposal> {
  const result = await prepareDeterministicFindTime(
    { ...input, allowNoValidSlot: true },
    deps.dataSource,
    deps.candidateIdFactory,
  );
  const snapshot = requestSnapshot(result);
  const completedAt = (deps.clock ?? (() => new Date()))().toISOString();

  const requestId = await deps.repository.claimRatedRequest(input.userId, input.request.taskId);
  if (requestId === null) {
    throw new EdgeError('AI_RATE_LIMITED', 'Find Time is limited to 10 attempts per hour.', 429);
  }

  let requestMarkedFailed = false;
  try {
    if (result.candidates.length === 0) {
      await deps.repository.updateRequest(input.userId, requestId, {
        status: 'failed',
        constraints: snapshot.constraints,
        targetCalendarId: snapshot.targetCalendarId,
        taskVersion: snapshot.taskVersion,
        candidateCount: snapshot.candidateCount,
        errorCode: 'AI_NO_VALID_SLOT',
        completedAt,
      });
      requestMarkedFailed = true;
      throw new EdgeError(
        'AI_NO_VALID_SLOT',
        'No open time fits this task before its deadline.',
        422,
      );
    }

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'pending',
      constraints: snapshot.constraints,
      targetCalendarId: snapshot.targetCalendarId,
      taskVersion: snapshot.taskVersion,
      candidateCount: snapshot.candidateCount,
    });

    const provider = deps.createProvider();
    const ranking = await provider.rankCandidateSlots(buildAiRankingInput(result));
    const proposal = validateAiRankingProposal(ranking.proposal, result.candidates);
    const candidatesById = new Map(result.candidates.map((candidate) => [candidate.id, candidate]));
    const rows = proposal.suggestions.map<AiSuggestionToPersist>((suggestion) => {
      const candidate = candidatesById.get(suggestion.slotId);
      if (!candidate) {
        throw new EdgeError('AI_INVALID_OUTPUT', 'The AI selected an unknown candidate.', 502);
      }
      return {
        slotId: suggestion.slotId,
        startAt: candidate.startAt,
        endAt: candidate.endAt,
        rank: suggestion.rank,
        score: suggestion.score,
        reason: suggestion.reason,
      };
    });
    const suggestions = await deps.repository.insertSuggestions(requestId, rows);

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'proposed',
      provider: ranking.metadata.provider,
      model: ranking.metadata.model,
      promptVersion: ranking.metadata.promptVersion,
      latencyMs: ranking.metadata.latencyMs,
      inputTokens: ranking.metadata.usage.inputTokens,
      outputTokens: ranking.metadata.usage.outputTokens,
      reasoningTokens: ranking.metadata.usage.reasoningTokens,
      totalTokens: ranking.metadata.usage.totalTokens,
      completedAt: (deps.clock ?? (() => new Date()))().toISOString(),
      errorCode: null,
    });

    return {
      status: 'proposed',
      requestId,
      task: {
        id: result.task.id,
        durationMinutes: result.task.durationMinutes,
        deadlineAt: result.task.deadlineAt,
        version: result.task.version,
      },
      targetCalendar: result.targetCalendar,
      constraints: result.constraints,
      suggestions,
    };
  } catch (error) {
    if (!requestMarkedFailed) {
      await markRequestFailed(deps.repository, input.userId, requestId, error, deps.clock);
    }
    throw error;
  }
}

function requestSnapshot(result: DeterministicFindTimeResult): AiRequestSnapshot {
  return {
    taskId: result.task.id,
    targetCalendarId: result.targetCalendar.id,
    taskVersion: result.task.version,
    constraints: result.constraints,
    candidateCount: result.candidates.length,
  };
}

async function markRequestFailed(
  repository: AiScheduleRepository,
  userId: string,
  requestId: string,
  error: unknown,
  clock: (() => Date) | undefined,
): Promise<void> {
  const errorCode = error instanceof EdgeError ? error.code : 'UNKNOWN';
  try {
    await repository.updateRequest(userId, requestId, {
      status: 'failed',
      errorCode,
      completedAt: (clock ?? (() => new Date()))().toISOString(),
    });
  } catch (updateError) {
    console.error(
      JSON.stringify({
        code: 'AI_REQUEST_FAILURE_UPDATE_FAILED',
        detail: updateError instanceof EdgeError ? updateError.code : 'UNKNOWN',
      }),
    );
  }
}
