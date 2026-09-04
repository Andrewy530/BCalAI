import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';
import { aiScheduleRequestSchema } from '@cal/schemas/scheduling';

import {
  prepareDeterministicFindTime,
  type FindTimeDataSource,
  type FindTimeProfile,
  type FindTimeTask,
} from './find-time.ts';
import { EdgeError, type EdgeErrorCode } from '../errors/index.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const CALENDAR_ID = '33333333-3333-3333-3333-333333333333';
const NOW = new Date('2026-08-31T12:00:00.000Z'); // Monday, 08:00 New York.

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

function profile(overrides: Partial<FindTimeProfile> = {}): FindTimeProfile {
  return {
    timezone: 'America/New_York',
    workingHours: WORKING_HOURS,
    updatedAt: '2026-08-31T10:00:00.000Z',
    ...overrides,
  };
}

function dataSource(overrides: Partial<FindTimeDataSource> = {}): FindTimeDataSource {
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

const request = () => ({ taskId: TASK_ID });
const candidateId = (index: number) => `candidate-${index + 1}`;

async function expectCode(promise: Promise<unknown>, code: EdgeErrorCode): Promise<void> {
  const error = await assertRejects(() => promise, EdgeError);
  assertEquals(error.code, code);
}

Deno.test('builds opaque deterministic candidates from owned task and profile state', async () => {
  const result = await prepareDeterministicFindTime(
    { userId: USER_ID, request: request(), now: NOW },
    dataSource(),
    candidateId,
  );

  assertEquals(result.targetCalendar, {
    id: CALENDAR_ID,
    name: 'Personal',
    sourceType: 'internal',
    isDefault: true,
    isReadOnly: false,
    updatedAt: '2026-08-31T10:30:00.000Z',
  });
  assertEquals(result.task.durationMinutes, 60);
  assertEquals(result.constraints.timezone, 'America/New_York');
  assertEquals(result.constraints.granularityMinutes, 15);
  assertEquals(result.candidates[0], {
    id: 'candidate-1',
    startAt: '2026-08-31T13:00:00.000Z',
    endAt: '2026-08-31T14:00:00.000Z',
    minutesFromPreviousBusy: null,
    minutesUntilNextBusy: null,
  });
});

Deno.test('does not distinguish a missing task from another user task', async () => {
  const missing = dataSource({ loadTask: () => Promise.resolve(null) });
  await expectCode(
    prepareDeterministicFindTime(
      { userId: USER_ID, request: request(), now: NOW },
      missing,
      candidateId,
    ),
    'NOT_FOUND',
  );
});

Deno.test('rejects completed, fixed, and already-scheduled tasks', async () => {
  for (const value of [
    task({ status: 'completed' }),
    task({ isFlexible: false }),
    task({ scheduledEventId: '44444444-4444-4444-4444-444444444444' }),
  ]) {
    await expectCode(
      prepareDeterministicFindTime(
        { userId: USER_ID, request: request(), now: NOW },
        dataSource({ loadTask: () => Promise.resolve(value) }),
        candidateId,
      ),
      'AI_TASK_NOT_SCHEDULABLE',
    );
  }
});

Deno.test('requires a valid whole-task duration', async () => {
  for (const estimatedMinutes of [null, 4, 721, 30.5]) {
    await expectCode(
      prepareDeterministicFindTime(
        { userId: USER_ID, request: request(), now: NOW },
        dataSource({
          loadTask: () => Promise.resolve(task({ estimatedMinutes })),
        }),
        candidateId,
      ),
      'AI_TASK_DURATION_REQUIRED',
    );
  }
});

Deno.test('requires a future deadline or explicit bounded horizon', async () => {
  await expectCode(
    prepareDeterministicFindTime(
      { userId: USER_ID, request: request(), now: NOW },
      dataSource({ loadTask: () => Promise.resolve(task({ dueAt: null })) }),
      candidateId,
    ),
    'AI_SCHEDULING_WINDOW_INVALID',
  );

  await expectCode(
    prepareDeterministicFindTime(
      { userId: USER_ID, request: request(), now: NOW },
      dataSource({
        loadTask: () => Promise.resolve(task({ dueAt: '2026-08-31T11:59:00.000Z' })),
      }),
      candidateId,
    ),
    'AI_SCHEDULING_WINDOW_INVALID',
  );
});

Deno.test('caps an explicit scheduling horizon at fourteen local days', async () => {
  const result = await prepareDeterministicFindTime(
    {
      userId: USER_ID,
      request: { taskId: TASK_ID, windowEnd: '2026-10-01T00:00:00.000Z' },
      now: NOW,
    },
    dataSource({ loadTask: () => Promise.resolve(task({ dueAt: null })) }),
    candidateId,
  );

  assertEquals(result.constraints.windowEnd, '2026-09-14T12:00:00.000Z');
});

Deno.test('treats a date-only deadline as the end of its local day', async () => {
  const now = new Date('2026-03-09T12:00:00.000Z');
  const result = await prepareDeterministicFindTime(
    { userId: USER_ID, request: request(), now },
    dataSource({
      loadTask: () =>
        Promise.resolve(task({ dueAt: '2026-03-09T16:00:00.000Z', hasDueTime: false })),
    }),
    candidateId,
  );

  assertEquals(result.task.deadlineAt, '2026-03-10T04:00:00.000Z');
});

Deno.test('keeps working hours at local wall-clock time across DST', async () => {
  const now = new Date('2026-03-06T12:00:00.000Z');
  const result = await prepareDeterministicFindTime(
    {
      userId: USER_ID,
      request: { taskId: TASK_ID, windowEnd: '2026-03-10T22:00:00.000Z' },
      now,
    },
    dataSource({ loadTask: () => Promise.resolve(task({ dueAt: null })) }),
    candidateId,
  );

  assert(result.candidates.some((slot) => slot.startAt === '2026-03-06T14:00:00.000Z'));
  assert(result.candidates.some((slot) => slot.startAt === '2026-03-09T13:00:00.000Z'));
});

Deno.test('allows exact adjacency but applies requested event buffers', async () => {
  const meeting = {
    calendarId: CALENDAR_ID,
    startAt: '2026-08-31T14:00:00.000Z',
    endAt: '2026-08-31T15:00:00.000Z',
    timezone: 'America/New_York',
    status: 'confirmed' as const,
    recurrenceRule: null,
    sourceType: 'internal' as const,
    providerEventId: null,
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
  };
  const source = dataSource({ loadEvents: () => Promise.resolve([meeting]) });

  const adjacent = await prepareDeterministicFindTime(
    { userId: USER_ID, request: request(), now: NOW },
    source,
    candidateId,
  );
  assert(
    adjacent.candidates.some(
      (slot) =>
        slot.startAt === '2026-08-31T13:00:00.000Z' && slot.endAt === '2026-08-31T14:00:00.000Z',
    ),
  );

  const buffered = await prepareDeterministicFindTime(
    { userId: USER_ID, request: { ...request(), bufferMinutes: 15 }, now: NOW },
    source,
    candidateId,
  );
  assert(
    !buffered.candidates.some(
      (slot) =>
        slot.startAt === '2026-08-31T13:00:00.000Z' && slot.endAt === '2026-08-31T14:00:00.000Z',
    ),
  );
  assertEquals(adjacent.candidates[0]?.minutesUntilNextBusy, 0);
});

Deno.test(
  'loads enough surrounding event time to apply buffers at the window boundary',
  async () => {
    const now = new Date('2026-08-31T13:00:00.000Z'); // 09:00 New York.
    const meeting = {
      calendarId: CALENDAR_ID,
      startAt: '2026-08-31T12:30:00.000Z',
      endAt: '2026-08-31T12:50:00.000Z',
      timezone: 'America/New_York',
      status: 'confirmed' as const,
      recurrenceRule: null,
      sourceType: 'internal' as const,
      providerEventId: null,
      recurringEventId: null,
      recurrenceOriginalStartAt: null,
    };
    const source = dataSource({
      loadEvents: (_userId, queryWindow) =>
        Promise.resolve(
          new Date(meeting.endAt) > queryWindow.start && new Date(meeting.startAt) < queryWindow.end
            ? [meeting]
            : [],
        ),
    });

    const result = await prepareDeterministicFindTime(
      {
        userId: USER_ID,
        request: { ...request(), bufferMinutes: 15 },
        now,
      },
      source,
      candidateId,
    );

    assertEquals(result.candidates[0]?.startAt, '2026-08-31T13:15:00.000Z');
  },
);

Deno.test('returns no-slot for a fully booked window', async () => {
  await expectCode(
    prepareDeterministicFindTime(
      { userId: USER_ID, request: request(), now: NOW },
      dataSource({
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
      candidateId,
    ),
    'AI_NO_VALID_SLOT',
  );
});

Deno.test(
  'preserves preferred time as ranking context without inventing availability',
  async () => {
    const result = await prepareDeterministicFindTime(
      {
        userId: USER_ID,
        request: { taskId: TASK_ID, preferredTimeOfDay: 'afternoon' },
        now: NOW,
      },
      dataSource(),
      candidateId,
    );

    assertEquals(result.constraints.preferredTimeOfDay, 'afternoon');
    assert(result.candidates.some((slot) => slot.startAt === '2026-08-31T13:00:00.000Z'));
  },
);

Deno.test(
  'rejects a missing default internal calendar and malformed profile constraints',
  async () => {
    await expectCode(
      prepareDeterministicFindTime(
        { userId: USER_ID, request: request(), now: NOW },
        dataSource({ loadTargetCalendar: () => Promise.resolve(null) }),
        candidateId,
      ),
      'AI_DEFAULT_CALENDAR_MISSING',
    );

    await expectCode(
      prepareDeterministicFindTime(
        { userId: USER_ID, request: request(), now: NOW },
        dataSource({ loadProfile: () => Promise.resolve(profile({ timezone: 'Mars/Olympus' })) }),
        candidateId,
      ),
      'AI_SCHEDULING_WINDOW_INVALID',
    );
  },
);

Deno.test('rejects a read-only or otherwise invalid default target calendar', async () => {
  for (const invalidCalendar of [
    {
      id: CALENDAR_ID,
      name: 'Personal',
      sourceType: 'internal' as const,
      isDefault: true,
      isReadOnly: true,
      updatedAt: '2026-08-31T10:30:00.000Z',
    },
    {
      id: CALENDAR_ID,
      name: 'Personal',
      sourceType: 'google' as const,
      isDefault: true,
      isReadOnly: false,
      updatedAt: '2026-08-31T10:30:00.000Z',
    },
    {
      id: CALENDAR_ID,
      name: 'Personal',
      sourceType: 'internal' as const,
      isDefault: false,
      isReadOnly: false,
      updatedAt: '2026-08-31T10:30:00.000Z',
    },
  ]) {
    await expectCode(
      prepareDeterministicFindTime(
        { userId: USER_ID, request: request(), now: NOW },
        dataSource({ loadTargetCalendar: () => Promise.resolve(invalidCalendar) }),
        candidateId,
      ),
      'AI_DEFAULT_CALENDAR_MISSING',
    );
  }
});

Deno.test('request schema rejects engine-owned overrides and inverted local bands', () => {
  assertEquals(
    aiScheduleRequestSchema.safeParse({
      taskId: TASK_ID,
      constraints: { durationMinutes: 15 },
    }).success,
    false,
  );
  assertEquals(
    aiScheduleRequestSchema.safeParse({
      taskId: TASK_ID,
      earliestMinute: 17 * 60,
      latestMinute: 9 * 60,
    }).success,
    false,
  );
});
