import { aiScheduleProposalSchema } from '@cal/schemas/scheduling';

import { EdgeError, type EdgeErrorCode } from '../../errors/index.ts';
import type { AiRankingProvider, AiRankingResult } from '../ranking.ts';
import { AI_EVALUATION_FIXTURES, type AiEvaluationFixture } from './fixtures.ts';

export const AI_EVALUATION_PRICE_SNAPSHOT = {
  capturedAt: '2026-09-01',
  source: 'https://developers.openai.com/api/docs/models',
  perMillionTokensUsd: {
    'gpt-5.6-luna': { input: 0.2, output: 1.2 },
    'gpt-5.6-terra': { input: 2, output: 12 },
  },
} as const;

export interface AiEvaluationGrade {
  completed: boolean;
  schemaValid: boolean;
  candidateSafetyPassed: boolean;
  invariantPassed: boolean;
  noProviderCallPassed: boolean;
  passed: boolean;
}

export interface AiEvaluationRecord {
  fixtureId: string;
  model: string;
  repetition: number;
  providerCalled: boolean;
  topCandidateId: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  estimatedCostUsd: number | null;
  errorCode: EdgeErrorCode | null;
  grade: AiEvaluationGrade;
}

export interface AiEvaluationSummary {
  model: string;
  attemptedRuns: number;
  completedRuns: number;
  schemaValidRate: number;
  candidateSafetyRate: number;
  invariantPassRate: number;
  averageLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  estimatedCostUsd: number;
}

export interface RunAiEvaluationOptions {
  models: readonly string[];
  repetitions: number;
  createProvider(model: string): AiRankingProvider;
  fixtures?: readonly AiEvaluationFixture[];
}

export async function runAiRankingEvaluation(
  options: RunAiEvaluationOptions,
): Promise<{ records: AiEvaluationRecord[]; summaries: AiEvaluationSummary[] }> {
  const fixtures = options.fixtures ?? AI_EVALUATION_FIXTURES;
  const records: AiEvaluationRecord[] = [];

  for (const model of options.models) {
    const provider = options.createProvider(model);
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      for (const fixture of fixtures) {
        records.push(await evaluateFixture(provider, model, repetition, fixture));
      }
    }
  }

  return {
    records,
    summaries: options.models.map((model) => summarizeModel(model, records)),
  };
}

async function evaluateFixture(
  provider: AiRankingProvider,
  model: string,
  repetition: number,
  fixture: AiEvaluationFixture,
): Promise<AiEvaluationRecord> {
  if (fixture.expectNoProviderCall) {
    const grade = gradeFixture(fixture, null, 'AI_NO_VALID_SLOT', false);
    return emptyRecord(fixture.id, model, repetition, false, 'AI_NO_VALID_SLOT', grade);
  }

  try {
    const result = await provider.rankCandidateSlots(fixture.input);
    const grade = gradeFixture(fixture, result, null, true);
    return {
      fixtureId: fixture.id,
      model,
      repetition,
      providerCalled: true,
      topCandidateId: result.proposal.suggestions[0]?.slotId ?? null,
      promptVersion: result.metadata.promptVersion,
      latencyMs: result.metadata.latencyMs,
      inputTokens: result.metadata.usage.inputTokens,
      outputTokens: result.metadata.usage.outputTokens,
      reasoningTokens: result.metadata.usage.reasoningTokens,
      estimatedCostUsd: estimateCost(model, result),
      errorCode: null,
      grade,
    };
  } catch (error) {
    const code = error instanceof EdgeError ? error.code : 'UNKNOWN';
    const grade = gradeFixture(fixture, null, code, true);
    return emptyRecord(fixture.id, model, repetition, true, code, grade);
  }
}

export function gradeFixture(
  fixture: AiEvaluationFixture,
  result: AiRankingResult | null,
  errorCode: EdgeErrorCode | null,
  providerCalled: boolean,
): AiEvaluationGrade {
  if (fixture.expectNoProviderCall) {
    const passed = !providerCalled && errorCode === 'AI_NO_VALID_SLOT';
    return {
      completed: passed,
      schemaValid: passed,
      candidateSafetyPassed: passed,
      invariantPassed: passed,
      noProviderCallPassed: passed,
      passed,
    };
  }

  const completed = result !== null;
  const parsedProposal =
    result !== null ? aiScheduleProposalSchema.safeParse(result.proposal) : null;
  const schemaValid = parsedProposal?.success ?? false;

  const candidateIds = new Set(fixture.input.candidates.map((candidate) => candidate.id));
  const hasUnknownCandidate =
    parsedProposal !== null &&
    (!parsedProposal.success ||
      parsedProposal.data.suggestions.some((suggestion) => !candidateIds.has(suggestion.slotId)));

  const candidateSafetyPassed =
    (result !== null && schemaValid && !hasUnknownCandidate) || errorCode === 'AI_INVALID_OUTPUT';
  const topCandidateId = parsedProposal?.success
    ? (parsedProposal.data.suggestions[0]?.slotId ?? null)
    : null;
  const invariantPassed =
    topCandidateId !== null &&
    !hasUnknownCandidate &&
    schemaValid &&
    fixture.acceptableTopCandidateIds.includes(topCandidateId);
  const noProviderCallPassed = providerCalled;

  return {
    completed,
    schemaValid,
    candidateSafetyPassed,
    invariantPassed,
    noProviderCallPassed,
    passed:
      completed && schemaValid && candidateSafetyPassed && invariantPassed && noProviderCallPassed,
  };
}

function summarizeModel(
  model: string,
  records: readonly AiEvaluationRecord[],
): AiEvaluationSummary {
  const attempted = records.filter((record) => record.model === model && record.providerCalled);
  const completed = attempted.filter((record) => record.grade.completed);
  const latencies = completed
    .map((record) => record.latencyMs)
    .filter((latency): latency is number => latency !== null);

  return {
    model,
    attemptedRuns: attempted.length,
    completedRuns: completed.length,
    schemaValidRate: rate(attempted, (record) => record.grade.schemaValid),
    candidateSafetyRate: rate(attempted, (record) => record.grade.candidateSafetyPassed),
    invariantPassRate: rate(attempted, (record) => record.grade.invariantPassed),
    averageLatencyMs:
      latencies.length === 0
        ? null
        : latencies.reduce((total, latency) => total + latency, 0) / latencies.length,
    totalInputTokens: sumNullable(attempted.map((record) => record.inputTokens)),
    totalOutputTokens: sumNullable(attempted.map((record) => record.outputTokens)),
    totalReasoningTokens: sumNullable(attempted.map((record) => record.reasoningTokens)),
    estimatedCostUsd: attempted.reduce(
      (total, record) => total + (record.estimatedCostUsd ?? 0),
      0,
    ),
  };
}

function estimateCost(model: string, result: AiRankingResult): number | null {
  if (!(model in AI_EVALUATION_PRICE_SNAPSHOT.perMillionTokensUsd)) return null;
  const price =
    AI_EVALUATION_PRICE_SNAPSHOT.perMillionTokensUsd[
      model as keyof typeof AI_EVALUATION_PRICE_SNAPSHOT.perMillionTokensUsd
    ];
  const inputTokens = result.metadata.usage.inputTokens;
  const outputTokens = result.metadata.usage.outputTokens;
  if (inputTokens === null || outputTokens === null) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

function emptyRecord(
  fixtureId: string,
  model: string,
  repetition: number,
  providerCalled: boolean,
  errorCode: EdgeErrorCode,
  grade: AiEvaluationGrade,
): AiEvaluationRecord {
  return {
    fixtureId,
    model,
    repetition,
    providerCalled,
    topCandidateId: null,
    promptVersion: null,
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    estimatedCostUsd: null,
    errorCode,
    grade,
  };
}

function rate<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(predicate).length / values.length;
}

function sumNullable(values: readonly (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
