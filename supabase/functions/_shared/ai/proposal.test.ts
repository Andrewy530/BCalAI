import { assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';
import type { AiRankingProvider } from './ranking.ts';
import { generateAiFindTimeProposal, type GenerateAiFindTimeProposalDeps } from './proposal.ts';
import {
  supabaseAiScheduleRepository,
  type AiScheduleRepository,
  type AiSuggestionToPersist,
} from './proposal-repository.ts';
import { type FindTimeDataSource, type FindTimeProfile, type FindTimeTask } from './find-time.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EdgeError } from '../errors/index.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const CALENDAR_ID = '33333333-3333-3333-3333-333333333333';
const REQUEST_ID = '44444444-4444-4444-4444-444444444444';
const NOW = new Date('2026-08-31T12:00:00.000Z');

const WORKING_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

function task(overrides: Partial<FindTimeTask> = {}): FindTimeTask {
  return {
    id: TASK_ID,
    title: 'Write project brief',
    status: 'open',
    priority: 'normal',
    dueAt: '2026-09-02T21:00:00.000Z',
    hasDueTime: true,
    estimatedMinutes: 60,
    scheduledEventId: null,
    isFlexible: true,
    updatedAt: '2026-08-31T11:00:00.000Z',
    ...overrides,
  };
}

function profile(): FindTimeProfile {
  return {
    timezone: 'America/New_York',
    workingHours: WORKING_HOURS,
    updatedAt: '2026-08-31T10:00:00.000Z',
  };
}

function source(overrides: Partial<FindTimeDataSource> = {}): FindTimeDataSource {
  return {
    loadTask: () => Promise.resolve(task()),
    loadProfile: () => Promise.resolve(profile()),
    loadTargetCalendar: () =>
      Promise.resolve({
        id: CALENDAR_ID,
        name: 'Personal',
        sourceType: 'internal' as const,
        isDefault: true,
        isReadOnly: false,
        updatedAt: '2026-08-31T10:30:00.000Z',
      }),
    loadEvents: () => Promise.resolve([]),
    ...overrides,
  };
}

function repository(overrides: Partial<AiScheduleRepository> = {}): AiScheduleRepository {
  return {
    claimRatedRequest: () => Promise.resolve(REQUEST_ID),
    updateRequest: () => Promise.resolve(),
    insertSuggestions: (_requestId, suggestions) =>
      Promise.resolve(
        suggestions.map((suggestion, index) => ({
          ...suggestion,
          id: `55555555-5555-5555-5555-55555555555${index + 1}`,
        })),
      ),
    ...overrides,
  };
}

function providerFor(buildProposal: AiRankingProvider['rankCandidateSlots']): AiRankingProvider {
  return {
    provider: 'fixture',
    model: 'fixture-model',
    rankCandidateSlots: buildProposal,
  };
}

function deps(
  overrides: Partial<GenerateAiFindTimeProposalDeps> = {},
): GenerateAiFindTimeProposalDeps {
  return {
    dataSource: source(),
    repository: repository(),
    createProvider: () =>
      providerFor((input) => {
        const candidate = input.candidates[0];
        if (!candidate) throw new Error('Fixture needs a candidate.');
        return Promise.resolve({
          proposal: {
            suggestions: [
              { slotId: candidate.id, rank: 1, score: 0.9, reason: 'First valid option.' },
            ],
          },
          metadata: {
            provider: 'fixture',
            model: 'fixture-model',
            responseId: 'fixture-response',
            promptVersion: 'find-time-ranker-v1',
            latencyMs: 12,
            usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 1, totalTokens: 15 },
          },
        });
      }),
    candidateIdFactory: (index) => `candidate_${index + 1}`,
    clock: () => new Date('2026-08-31T12:01:00.000Z'),
    ...overrides,
  };
}

Deno.test('persists only generated timestamps and returns a proposed request', async () => {
  const persisted: AiSuggestionToPersist[] = [];
  const updates: Array<{ requestId: string; patch: Record<string, unknown> }> = [];
  const result = await generateAiFindTimeProposal(
    { userId: USER_ID, request: { taskId: TASK_ID }, now: NOW },
    deps({
      repository: repository({
        updateRequest: (_userId, requestId, patch) => {
          updates.push({ requestId, patch: { ...patch } });
          return Promise.resolve();
        },
        insertSuggestions: (_requestId, suggestions) => {
          persisted.push(...suggestions);
          return Promise.resolve(
            suggestions.map((suggestion) => ({ ...suggestion, id: REQUEST_ID })),
          );
        },
      }),
    }),
  );

  assertEquals(result.status, 'proposed');
  assertEquals(result.requestId, REQUEST_ID);
  assertEquals(result.suggestions[0]?.slotId, 'candidate_1');
  assertEquals(result.suggestions[0]?.startAt, '2026-08-31T13:00:00.000Z');
  assertEquals(persisted[0]?.startAt, '2026-08-31T13:00:00.000Z');
  assertEquals(updates[0]?.patch.status, 'pending');
  assertEquals(updates.at(-1)?.patch.status, 'proposed');
  assertEquals(updates.at(-1)?.patch.model, 'fixture-model');
});

Deno.test(
  'does not claim quota or create a provider when no deterministic slot exists',
  async () => {
    let claimCalls = 0;
    let providerCalls = 0;
    const failedUpdates: Array<Record<string, unknown>> = [];
    const error = await assertRejects(
      () =>
        generateAiFindTimeProposal(
          { userId: USER_ID, request: { taskId: TASK_ID }, now: NOW },
          deps({
            dataSource: source({
              loadEvents: () =>
                Promise.resolve([
                  {
                    calendarId: CALENDAR_ID,
                    startAt: '2026-08-31T00:00:00.000Z',
                    endAt: '2026-09-03T00:00:00.000Z',
                    timezone: 'America/New_York',
                    status: 'confirmed',
                    recurrenceRule: null,
                    sourceType: 'internal',
                    providerEventId: null,
                    recurringEventId: null,
                    recurrenceOriginalStartAt: null,
                  },
                ]),
            }),
            repository: repository({
              claimRatedRequest: () => {
                claimCalls += 1;
                return Promise.resolve(REQUEST_ID);
              },
              updateRequest: (_userId, _requestId, patch) => {
                failedUpdates.push({ ...patch });
                return Promise.resolve();
              },
            }),
            createProvider: () => {
              providerCalls += 1;
              return providerFor(() => Promise.reject(new Error('must not call')));
            },
          }),
        ),
      EdgeError,
    );

    assertEquals(error.code, 'AI_NO_VALID_SLOT');
    assertEquals(claimCalls, 1);
    assertEquals(providerCalls, 0);
    const failedUpdate = failedUpdates[0];
    if (failedUpdate === undefined) throw new Error('Expected a failed request update.');
    assertEquals(failedUpdate.status, 'failed');
    assertEquals(failedUpdate.errorCode, 'AI_NO_VALID_SLOT');
    assertEquals(failedUpdate.candidateCount, 0);
  },
);

Deno.test(
  'does not construct a provider when the atomic rate-limit claim is exhausted',
  async () => {
    let providerCalls = 0;
    const error = await assertRejects(
      () =>
        generateAiFindTimeProposal(
          { userId: USER_ID, request: { taskId: TASK_ID }, now: NOW },
          deps({
            repository: repository({ claimRatedRequest: () => Promise.resolve(null) }),
            createProvider: () => {
              providerCalls += 1;
              return providerFor(() => Promise.reject(new Error('must not call')));
            },
          }),
        ),
      EdgeError,
    );

    assertEquals(error.code, 'AI_RATE_LIMITED');
    assertEquals(providerCalls, 0);
  },
);

Deno.test('marks a request failed when a provider proposes an unknown slot', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const error = await assertRejects(
    () =>
      generateAiFindTimeProposal(
        { userId: USER_ID, request: { taskId: TASK_ID }, now: NOW },
        deps({
          repository: repository({
            updateRequest: (_userId, _requestId, patch) => {
              updates.push({ ...patch });
              return Promise.resolve();
            },
          }),
          createProvider: () =>
            providerFor(() =>
              Promise.resolve({
                proposal: {
                  suggestions: [
                    {
                      slotId: 'not-generated',
                      rank: 1,
                      score: 1,
                      reason: 'Unsafe fixture output.',
                    },
                  ],
                },
                metadata: {
                  provider: 'fixture',
                  model: 'fixture-model',
                  responseId: null,
                  promptVersion: 'find-time-ranker-v1',
                  latencyMs: 1,
                  usage: {
                    inputTokens: null,
                    outputTokens: null,
                    reasoningTokens: null,
                    totalTokens: null,
                  },
                },
              }),
            ),
        }),
      ),
    EdgeError,
  );

  assertEquals(error.code, 'AI_INVALID_OUTPUT');
  assertEquals(updates.at(-1)?.status, 'failed');
  assertEquals(updates.at(-1)?.errorCode, 'AI_INVALID_OUTPUT');
});

Deno.test('supabaseAiScheduleRepository.updateRequest throws 500 when no row matches', async () => {
  const admin = {
    from(table: string) {
      assertEquals(table, 'ai_schedule_requests');
      return {
        update(_payload: Record<string, unknown>) {
          return this;
        },
        eq(_column: string, _value: unknown) {
          return this;
        },
        select(_columns: string) {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  } as unknown as SupabaseClient;

  const repo = supabaseAiScheduleRepository(admin);
  const error = await assertRejects(
    () =>
      repo.updateRequest(USER_ID, REQUEST_ID, { status: 'failed', errorCode: 'AI_INVALID_OUTPUT' }),
    EdgeError,
  );

  assertEquals(error.code, 'UNKNOWN');
  assertEquals(error.status, 500);
});

Deno.test(
  'supabaseAiScheduleRepository.updateRequest succeeds when target row matches',
  async () => {
    const filters: Array<[string, unknown]> = [];
    let selectedColumns: string | null = null;
    const admin = {
      from(table: string) {
        assertEquals(table, 'ai_schedule_requests');
        return {
          update(_payload: Record<string, unknown>) {
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return this;
          },
          select(columns: string) {
            selectedColumns = columns;
            return Promise.resolve({ data: [{ id: REQUEST_ID }], error: null });
          },
        };
      },
    } as unknown as SupabaseClient;

    const repo = supabaseAiScheduleRepository(admin);
    await repo.updateRequest(USER_ID, REQUEST_ID, { status: 'proposed' });

    assertEquals(selectedColumns, 'id');
    assertEquals(filters, [
      ['id', REQUEST_ID],
      ['user_id', USER_ID],
    ]);
  },
);
