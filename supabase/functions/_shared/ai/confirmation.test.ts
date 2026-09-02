import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../errors/index.ts';
import { confirmAiScheduleSuggestion, type ConfirmAiScheduleDeps } from './confirmation.ts';
import type {
  AiConfirmationRepository,
  ConfirmedSchedule,
  PersistedAiConfirmation,
} from './confirmation-repository.ts';
import type {
  FindTimeDataSource,
  FindTimeProfile,
  FindTimeTargetCalendar,
  FindTimeTask,
} from './find-time.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '99999999-9999-9999-9999-999999999999';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const CALENDAR_ID = '33333333-3333-3333-3333-333333333333';
const SUGGESTION_ID = '44444444-4444-4444-4444-444444444444';
const EVENT_ID = '55555555-5555-5555-5555-555555555555';
const NOW = new Date('2026-08-31T12:00:00.000Z');
const TASK_VERSION = '2026-08-31T11:00:00.000Z';
const PROFILE_VERSION = '2026-08-31T10:00:00.000Z';
const CALENDAR_VERSION = '2026-08-31T10:30:00.000Z';

const WORKING_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

const CONSTRAINTS = {
  durationMinutes: 60,
  windowStart: NOW.toISOString(),
  windowEnd: '2026-09-02T21:00:00.000Z',
  workingHours: WORKING_HOURS,
  timezone: 'America/New_York',
  bufferMinutes: 0,
  granularityMinutes: 15,
  splittable: false,
  minSplitMinutes: 30,
  preferredTimeOfDay: 'any' as const,
};

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
    updatedAt: TASK_VERSION,
    ...overrides,
  };
}

function profile(overrides: Partial<FindTimeProfile> = {}): FindTimeProfile {
  return {
    timezone: 'America/New_York',
    workingHours: WORKING_HOURS,
    updatedAt: PROFILE_VERSION,
    ...overrides,
  };
}

function calendar(overrides: Partial<FindTimeTargetCalendar> = {}): FindTimeTargetCalendar {
  return {
    id: CALENDAR_ID,
    name: 'Personal',
    sourceType: 'internal',
    isDefault: true,
    isReadOnly: false,
    updatedAt: CALENDAR_VERSION,
    ...overrides,
  };
}

function source(overrides: Partial<FindTimeDataSource> = {}): FindTimeDataSource {
  return {
    loadTask: () => Promise.resolve(task()),
    loadProfile: () => Promise.resolve(profile()),
    loadTargetCalendar: () => Promise.resolve(calendar()),
    loadEvents: () => Promise.resolve([]),
    ...overrides,
  };
}

function persisted(overrides: Partial<PersistedAiConfirmation> = {}): PersistedAiConfirmation {
  return {
    suggestionId: SUGGESTION_ID,
    requestId: '66666666-6666-6666-6666-666666666666',
    taskId: TASK_ID,
    requestStatus: 'proposed',
    constraints: CONSTRAINTS,
    targetCalendarId: CALENDAR_ID,
    taskVersion: TASK_VERSION,
    profileVersion: PROFILE_VERSION,
    targetCalendarVersion: CALENDAR_VERSION,
    acceptedEventId: null,
    startAt: '2026-08-31T13:00:00.000Z',
    endAt: '2026-08-31T14:00:00.000Z',
    acceptedAt: null,
    ...overrides,
  };
}

function canonical(): ConfirmedSchedule {
  return {
    event: {
      id: EVENT_ID,
      userId: USER_ID,
      calendarId: CALENDAR_ID,
      title: 'Write project brief',
      description: null,
      location: null,
      startAt: '2026-08-31T13:00:00.000Z',
      endAt: '2026-08-31T14:00:00.000Z',
      allDay: false,
      timezone: 'America/New_York',
      status: 'confirmed',
      recurrenceRule: null,
      alerts: [],
      sourceType: 'internal',
      providerEventId: null,
      recurringEventId: null,
      recurrenceOriginalStartAt: null,
      providerEtag: null,
      providerUpdatedAt: null,
      syncStatus: 'synced',
      createdAt: '2026-08-31T12:01:00.000Z',
      updatedAt: '2026-08-31T12:01:00.000Z',
    },
    task: {
      id: TASK_ID,
      userId: USER_ID,
      title: 'Write project brief',
      status: 'scheduled',
      scheduledEventId: EVENT_ID,
      updatedAt: '2026-08-31T12:01:00.000Z',
    },
  };
}

function repository(overrides: Partial<AiConfirmationRepository> = {}): AiConfirmationRepository {
  return {
    loadSuggestion: () => Promise.resolve(persisted()),
    confirmSuggestion: () => Promise.resolve({ status: 'accepted' as const, eventId: EVENT_ID }),
    loadCanonicalSchedule: () => Promise.resolve(canonical()),
    ...overrides,
  };
}

function deps(overrides: Partial<ConfirmAiScheduleDeps> = {}): ConfirmAiScheduleDeps {
  return {
    dataSource: source(),
    repository: repository(),
    now: () => NOW,
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await assertRejects(() => promise, EdgeError);
  assertEquals(error.code, code);
}

Deno.test('rejects missing or cross-user suggestions without disclosing them', async () => {
  let loadedUserId = '';
  await expectCode(
    confirmAiScheduleSuggestion(
      { userId: OTHER_USER_ID, suggestionId: SUGGESTION_ID },
      deps({
        repository: repository({
          loadSuggestion: (userId) => {
            loadedUserId = userId;
            return Promise.resolve(null);
          },
        }),
      }),
    ),
    'NOT_FOUND',
  );
  assertEquals(loadedUserId, OTHER_USER_ID);
});

Deno.test('confirms a valid persisted suggestion and returns canonical state', async () => {
  let confirmCalls = 0;
  const result = await confirmAiScheduleSuggestion(
    { userId: USER_ID, suggestionId: SUGGESTION_ID },
    deps({
      repository: repository({
        confirmSuggestion: () => {
          confirmCalls += 1;
          return Promise.resolve({ status: 'accepted' as const, eventId: EVENT_ID });
        },
      }),
    }),
  );

  assertEquals(result.status, 'accepted');
  assertEquals(result.requestId, '66666666-6666-6666-6666-666666666666');
  assertEquals(result.suggestionId, SUGGESTION_ID);
  assertEquals(result.event.id, EVENT_ID);
  assertEquals(result.task.scheduledEventId, EVENT_ID);
  assertEquals(confirmCalls, 1);
});

Deno.test('rejects completed, fixed, or already-scheduled tasks as stale', async () => {
  for (const changedTask of [
    task({ status: 'completed' }),
    task({ isFlexible: false }),
    task({ scheduledEventId: EVENT_ID }),
  ]) {
    let confirmCalls = 0;
    await expectCode(
      confirmAiScheduleSuggestion(
        { userId: USER_ID, suggestionId: SUGGESTION_ID },
        deps({
          dataSource: source({ loadTask: () => Promise.resolve(changedTask) }),
          repository: repository({
            confirmSuggestion: () => {
              confirmCalls += 1;
              return Promise.resolve({ status: 'accepted' as const, eventId: EVENT_ID });
            },
          }),
        }),
      ),
      'AI_PROPOSAL_STALE',
    );
    assertEquals(confirmCalls, 0);
  }
});

Deno.test('rejects a slot occupied after proposal generation', async () => {
  await expectCode(
    confirmAiScheduleSuggestion(
      { userId: USER_ID, suggestionId: SUGGESTION_ID },
      deps({
        dataSource: source({
          loadEvents: () =>
            Promise.resolve([
              {
                calendarId: CALENDAR_ID,
                startAt: '2026-08-31T13:30:00.000Z',
                endAt: '2026-08-31T14:30:00.000Z',
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
      }),
    ),
    'AI_PROPOSAL_STALE',
  );
});

Deno.test('rejects relevant task, profile, and calendar version changes', async () => {
  const cases: Array<Partial<FindTimeDataSource>> = [
    { loadTask: () => Promise.resolve(task({ updatedAt: '2026-08-31T11:01:00.000Z' })) },
    { loadProfile: () => Promise.resolve(profile({ updatedAt: '2026-08-31T10:01:00.000Z' })) },
    {
      loadTargetCalendar: () =>
        Promise.resolve(calendar({ updatedAt: '2026-08-31T10:31:00.000Z' })),
    },
  ];

  for (const override of cases) {
    await expectCode(
      confirmAiScheduleSuggestion(
        { userId: USER_ID, suggestionId: SUGGESTION_ID },
        deps({ dataSource: source(override) }),
      ),
      'AI_PROPOSAL_STALE',
    );
  }
});

Deno.test('rejects a replaced or read-only internal default calendar', async () => {
  for (const changedCalendar of [
    calendar({ id: '77777777-7777-7777-7777-777777777777' }),
    calendar({ isReadOnly: true }),
    calendar({ sourceType: 'google', isReadOnly: false }),
  ]) {
    await expectCode(
      confirmAiScheduleSuggestion(
        { userId: USER_ID, suggestionId: SUGGESTION_ID },
        deps({
          dataSource: source({ loadTargetCalendar: () => Promise.resolve(changedCalendar) }),
        }),
      ),
      'AI_PROPOSAL_STALE',
    );
  }
});

Deno.test(
  'repeated confirmation returns the canonical event without revalidation or insert',
  async () => {
    let sourceCalls = 0;
    let confirmCalls = 0;
    const result = await confirmAiScheduleSuggestion(
      { userId: USER_ID, suggestionId: SUGGESTION_ID },
      deps({
        dataSource: source({
          loadTask: () => {
            sourceCalls += 1;
            return Promise.reject(new Error('accepted retry must not reload task'));
          },
        }),
        repository: repository({
          loadSuggestion: () =>
            Promise.resolve(
              persisted({
                requestStatus: 'accepted',
                acceptedEventId: EVENT_ID,
                acceptedAt: '2026-08-31T12:01:00.000Z',
              }),
            ),
          confirmSuggestion: () => {
            confirmCalls += 1;
            return Promise.reject(new Error('accepted retry must not insert'));
          },
        }),
      }),
    );

    assertEquals(result.event.id, EVENT_ID);
    assertEquals(sourceCalls, 0);
    assertEquals(confirmCalls, 0);
  },
);

Deno.test(
  'two confirmations converge on one canonical event returned by the transaction',
  async () => {
    let confirmCalls = 0;
    let eventCreates = 0;
    let acceptedEventId: string | null = null;
    const sharedRepository = repository({
      confirmSuggestion: async () => {
        confirmCalls += 1;
        await Promise.resolve();
        if (acceptedEventId === null) {
          eventCreates += 1;
          acceptedEventId = EVENT_ID;
        }
        return { status: 'accepted' as const, eventId: acceptedEventId };
      },
    });
    const sharedDeps = deps({ repository: sharedRepository });

    const results = await Promise.all([
      confirmAiScheduleSuggestion({ userId: USER_ID, suggestionId: SUGGESTION_ID }, sharedDeps),
      confirmAiScheduleSuggestion({ userId: USER_ID, suggestionId: SUGGESTION_ID }, sharedDeps),
    ]);

    assertEquals(
      results.map((result) => result.event.id),
      [EVENT_ID, EVENT_ID],
    );
    assertEquals(confirmCalls, 2);
    assertEquals(eventCreates, 1);
  },
);

Deno.test('propagates a confirmation failure without fabricating accepted state', async () => {
  let canonicalCalls = 0;
  const error = new EdgeError('UNKNOWN', 'transaction failed', 500);
  await expectCode(
    confirmAiScheduleSuggestion(
      { userId: USER_ID, suggestionId: SUGGESTION_ID },
      deps({
        repository: repository({
          confirmSuggestion: () => Promise.reject(error),
          loadCanonicalSchedule: () => {
            canonicalCalls += 1;
            return Promise.resolve(canonical());
          },
        }),
      }),
    ),
    'UNKNOWN',
  );
  assertEquals(canonicalCalls, 0);
});
