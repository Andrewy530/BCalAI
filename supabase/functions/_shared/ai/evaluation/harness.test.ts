import { assertAlmostEquals, assertEquals } from 'jsr:@std/assert@^1.0.0';
import { aiRankCandidateSlotsInputSchema } from '@cal/schemas/scheduling';

import { EdgeError } from '../../errors/index.ts';
import type { AiRankingProvider } from '../ranking.ts';
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
