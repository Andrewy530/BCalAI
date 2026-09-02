import { createOpenAiRankingProvider, openAiRankingConfigFromEnv } from '../openai.ts';
import { AI_EVALUATION_PRICE_SNAPSHOT, runAiRankingEvaluation } from './harness.ts';

if (import.meta.main) {
  if (Deno.env.get('RUN_LIVE_AI_EVAL') !== 'true') {
    throw new Error('Set RUN_LIVE_AI_EVAL=true to acknowledge live API usage and cost.');
  }

  const config = openAiRankingConfigFromEnv();
  const result = await runAiRankingEvaluation({
    models: ['gpt-5.6-luna', 'gpt-5.6-terra'],
    repetitions: 5,
    createProvider: (model) => createOpenAiRankingProvider({ ...config, model }),
  });

  // Deliberately emit aggregate metrics and failure classes only. Prompts,
  // task text, notes, candidate timestamps, and provider bodies are excluded.
  console.log(
    JSON.stringify(
      {
        priceSnapshot: AI_EVALUATION_PRICE_SNAPSHOT,
        summaries: result.summaries,
        failures: result.records
          .filter((record) => !record.grade.passed)
          .map((record) => ({
            fixtureId: record.fixtureId,
            model: record.model,
            repetition: record.repetition,
            errorCode: record.errorCode,
            grade: record.grade,
          })),
      },
      null,
      2,
    ),
  );
}
