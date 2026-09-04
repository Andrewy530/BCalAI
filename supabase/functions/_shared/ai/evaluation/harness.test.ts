import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@^1.0.0';
import { aiRankCandidateSlotsInputSchema } from '@cal/schemas/scheduling';

import { EdgeError } from '../../errors/index.ts';
import type { AiRankingProvider, AiRankingResult } from '../ranking.ts';
import { AI_EVALUATION_FIXTURES } from './fixtures.ts';
import { gradeFixture, runAiRankingEvaluation } from './harness.ts';

Deno.test(
  'fixtures cover required preferences, adversarial text, opaque ids, and zero candidates',
  () => {
    const ids = new Set(AI_EVALUATION_FIXTURES.map((fixture) => fixture.id));
    for (const required of [
      'earliest',
      'latest',
      'morning',
      'afternoon',
      'evening',
      'deadline',
      'equivalent',
      'crowded',
      'long-duration',
      'irrelevant-instructions',
      'override-attempt',
      'opaque-ids',
      'zero-candidates',
    ]) {
      assertEquals(ids.has(required), true);
    }

    for (const fixture of AI_EVALUATION_FIXTURES) {
      if (fixture.expectNoProviderCall) {
        assertEquals(fixture.input.candidates.length, 0);
      } else {
        assertEquals(aiRankCandidateSlotsInputSchema.safeParse(fixture.input).success, true);
        assertEquals(
          fixture.input.candidates.every((candidate) => !/^slot_\d+$/.test(candidate.id)),
          true,
        );
      }
    }
  },
);

Deno.test(
  'runs repeatable model comparisons and never calls a provider for zero candidates',
  async () => {
    let providerCalls = 0;
    const result = await runAiRankingEvaluation({
      models: ['gpt-5.6-luna', 'gpt-5.6-terra'],
      repetitions: 2,
      createProvider: (model): AiRankingProvider => ({
        provider: 'openai',
        model,
        rankCandidateSlots: (input) => {
          providerCalls += 1;
          const fixture = AI_EVALUATION_FIXTURES.find(
            (candidateFixture) => candidateFixture.input === input,
          );
          const topId = fixture?.acceptableTopCandidateIds[0] ?? input.candidates[0]?.id;
          if (!topId) throw new EdgeError('AI_NO_VALID_SLOT', 'No candidates.', 422);
          return Promise.resolve({
            proposal: {
              suggestions: [{ slotId: topId, rank: 1, score: 1, reason: 'Fixture invariant.' }],
            },
            metadata: {
              provider: 'openai',
              model,
              responseId: 'resp_fixture',
              promptVersion: 'find-time-ranker-v1',
              latencyMs: 100,
              usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 5, totalTokens: 120 },
            },
          });
        },
      }),
    });

    const providerFixtures = AI_EVALUATION_FIXTURES.filter(
      (fixture) => !fixture.expectNoProviderCall,
    ).length;
    assertEquals(providerCalls, providerFixtures * 2 * 2);
    assertEquals(
      result.records.every((record) => record.grade.passed),
      true,
    );
    assertEquals(result.summaries[0]?.schemaValidRate, 1);
    assertEquals(result.summaries[0]?.candidateSafetyRate, 1);
    assertEquals(result.summaries[0]?.invariantPassRate, 1);
    assertAlmostEquals(result.summaries[0]?.estimatedCostUsd ?? 0, providerFixtures * 2 * 0.000044);
    assertAlmostEquals(result.summaries[1]?.estimatedCostUsd ?? 0, providerFixtures * 2 * 0.00044);
  },
);

Deno.test('counts rejected unsafe model output as safe rejection but not a valid run', () => {
  const fixture = AI_EVALUATION_FIXTURES.find((candidate) => candidate.id === 'override-attempt');
  if (!fixture) throw new Error('Missing fixture.');

  assertEquals(gradeFixture(fixture, null, 'AI_INVALID_OUTPUT', true), {
    completed: false,
    schemaValid: false,
    candidateSafetyPassed: true,
    invariantPassed: false,
    noProviderCallPassed: true,
    passed: false,
  });
});

Deno.test(
  'mechanical grading rejects proposals with unknown slots, duplicates, or malformed schema',
  () => {
    const fixture = AI_EVALUATION_FIXTURES.find((candidate) => candidate.id === 'morning');
    if (!fixture) throw new Error('Missing fixture.');

    const topId = fixture.acceptableTopCandidateIds[0]!;
    const nextValidId = fixture.acceptableTopCandidateIds[1]!;

    const dummyMetadata = {
      provider: 'openai',
      model: 'gpt-5.6-luna',
      responseId: 'resp_test',
      promptVersion: 'find-time-ranker-v1',
      latencyMs: 50,
      usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: null, totalTokens: 120 },
    };

    // Unknown slot at rank 2
    const unknownSlotResult: AiRankingResult = {
      proposal: {
        suggestions: [
          { slotId: topId, rank: 1, score: 0.95, reason: 'Valid top.' },
          { slotId: 'unknown_slot_xyz', rank: 2, score: 0.8, reason: 'Unknown slot.' },
        ],
      },
      metadata: dummyMetadata,
    };
    const unknownGrade = gradeFixture(fixture, unknownSlotResult, null, true);
    assertEquals(unknownGrade.candidateSafetyPassed, false);
    assertEquals(unknownGrade.invariantPassed, false);
    assertEquals(unknownGrade.passed, false);

    // Duplicate slot ID
    const duplicateSlotResult: AiRankingResult = {
      proposal: {
        suggestions: [
          { slotId: topId, rank: 1, score: 0.95, reason: 'First.' },
          { slotId: topId, rank: 2, score: 0.8, reason: 'Duplicate slot.' },
        ],
      },
      metadata: dummyMetadata,
    };
    const duplicateSlotGrade = gradeFixture(fixture, duplicateSlotResult, null, true);
    assertEquals(duplicateSlotGrade.schemaValid, false);
    assertEquals(duplicateSlotGrade.candidateSafetyPassed, false);
    assertEquals(duplicateSlotGrade.passed, false);

    // Duplicate rank
    const duplicateRankResult = {
      proposal: {
        suggestions: [
          { slotId: topId, rank: 1, score: 0.95, reason: 'First.' },
          { slotId: nextValidId, rank: 1, score: 0.8, reason: 'Duplicate rank.' },
        ],
      },
      metadata: dummyMetadata,
    } as unknown as AiRankingResult;
    const duplicateRankGrade = gradeFixture(fixture, duplicateRankResult, null, true);
    assertEquals(duplicateRankGrade.schemaValid, false);
    assertEquals(duplicateRankGrade.passed, false);

    // Malformed proposal (score > 1)
    const malformedScoreResult = {
      proposal: {
        suggestions: [{ slotId: topId, rank: 1, score: 1.5, reason: 'Bad score.' }],
      },
      metadata: dummyMetadata,
    } as unknown as AiRankingResult;
    const malformedGrade = gradeFixture(fixture, malformedScoreResult, null, true);
    assertEquals(malformedGrade.schemaValid, false);
    assertEquals(malformedGrade.passed, false);
  },
);
