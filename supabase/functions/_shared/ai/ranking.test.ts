import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import type { DeterministicFindTimeResult } from './find-time.ts';
import { buildAiRankingInput, validateAiRankingProposal } from './ranking.ts';
import { EdgeError } from '../errors/index.ts';

function deterministicResult(candidateCount = 2): DeterministicFindTimeResult {
  const start = Date.parse('2026-09-01T13:00:00.000Z');
  return {
    task: {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Write launch brief',
      priority: 'high',
      durationMinutes: 60,
      deadlineAt: '2026-09-03T21:00:00.000Z',
      version: '2026-09-01T12:00:00.000Z',
    },
    note: 'Prefer a comfortable gap.',
    targetCalendar: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Personal',
      sourceType: 'internal',
      isDefault: true,
      isReadOnly: false,
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    profileVersion: '2026-09-01T10:00:00.000Z',
    constraints: {
      durationMinutes: 60,
      windowStart: '2026-09-01T12:00:00.000Z',
      windowEnd: '2026-09-04T00:00:00.000Z',
      workingHours: [{ weekday: 2, startMinute: 540, endMinute: 1020 }],
      timezone: 'America/New_York',
      bufferMinutes: 0,
      granularityMinutes: 15,
      splittable: false,
      minSplitMinutes: 30,
      preferredTimeOfDay: 'morning',
    },
    candidates: Array.from({ length: candidateCount }, (_, index) => ({
      id: `opaque_${((index * 7919 + 104729) % 999983).toString(16).padStart(6, 'a')}`,
      startAt: new Date(start + index * 15 * 60_000).toISOString(),
      endAt: new Date(start + (index * 15 + 60) * 60_000).toISOString(),
      minutesFromPreviousBusy: index === 0 ? 60 : null,
      minutesUntilNextBusy: index === candidateCount - 1 ? 30 : null,
    })),
  };
}

Deno.test('builds a strict sanitized model input and caps candidates at forty', () => {
  const source = deterministicResult(81);
  const input = buildAiRankingInput(source);

  assertEquals(input.candidates.length, 40);
  assertEquals(input.candidates[0]?.id, source.candidates[0]?.id);
  assertEquals(input.candidates.at(-1)?.id, source.candidates.at(-1)?.id);
  assertEquals(input.candidates[0]?.localDate, '2026-09-01');
  assertEquals(input.candidates[0]?.localStartMinute, 9 * 60);
  assertEquals(input.task.title, 'Write launch brief');

  const serialized = JSON.stringify(input);
  assertEquals(serialized.includes('workingHours'), false);
  assertEquals(serialized.includes('targetCalendar'), false);
  assertEquals(serialized.includes('calendarId'), false);
  assertEquals(serialized.includes('event'), false);
});

Deno.test('accepts only known unique candidate ids with a valid contiguous ranking', () => {
  const input = buildAiRankingInput(deterministicResult());
  const proposal = validateAiRankingProposal(
    {
      suggestions: [
        { slotId: input.candidates[0]?.id, rank: 1, score: 0.95, reason: 'Morning fit.' },
        { slotId: input.candidates[1]?.id, rank: 2, score: 0.8, reason: 'Next option.' },
      ],
    },
    input.candidates,
  );

  assertEquals(proposal.suggestions.length, 2);
});

Deno.test('rejects unknown, duplicate, malformed, and timestamp-bearing model output', () => {
  const input = buildAiRankingInput(deterministicResult());
  const firstId = input.candidates[0]?.id;

  const invalidValues = [
    { suggestions: [{ slotId: 'invented_slot', rank: 1, score: 1, reason: 'Invented.' }] },
    {
      suggestions: [
        { slotId: firstId, rank: 1, score: 1, reason: 'First.' },
        { slotId: firstId, rank: 2, score: 0.5, reason: 'Duplicate.' },
      ],
    },
    { suggestions: [{ slotId: firstId, rank: 2, score: 1, reason: 'Bad rank.' }] },
    {
      suggestions: [
        { slotId: firstId, rank: 2, score: 1, reason: 'Reordered.' },
        {
          slotId: input.candidates[1]?.id,
          rank: 1,
          score: 0.5,
          reason: 'Reordered second option.',
        },
      ],
    },
    { suggestions: [{ slotId: firstId, rank: 1, score: 2, reason: 'Bad score.' }] },
    {
      suggestions: [
        {
          slotId: firstId,
          rank: 1,
          score: 1,
          reason: 'Has a timestamp.',
          startAt: '2026-09-01T13:00:00.000Z',
        },
      ],
    },
  ];

  for (const value of invalidValues) {
    const error = assertThrows(() => validateAiRankingProposal(value, input.candidates), EdgeError);
    assertEquals(error.code, 'AI_INVALID_OUTPUT');
  }
});

Deno.test(
  'preserves nonordinal candidate ids so the model cannot infer availability by sequence',
  () => {
    const ids = buildAiRankingInput(deterministicResult(4)).candidates.map(
      (candidate) => candidate.id,
    );
    assert(ids.every((id) => !/^slot_\d+$/.test(id)));
    assertEquals(new Set(ids).size, ids.length);
  },
);
