import { assertEquals, assertNotEquals } from 'jsr:@std/assert@^1.0.0';

import { calendarInitialSyncKey, calendarSyncKey } from './jobs.ts';

const calendarId = '11111111-1111-1111-1111-111111111111';

Deno.test('initial sync keys are stable for one imported calendar row', () => {
  assertEquals(calendarInitialSyncKey(calendarId), `calendar-initial-sync:${calendarId}`);
  assertEquals(calendarInitialSyncKey(calendarId), calendarInitialSyncKey(calendarId));
});

Deno.test('a new local calendar row gets a distinct initial sync key', () => {
  const replacementId = '22222222-2222-2222-2222-222222222222';

  assertNotEquals(calendarInitialSyncKey(calendarId), calendarInitialSyncKey(replacementId));
  assertNotEquals(
    calendarInitialSyncKey(calendarId),
    calendarSyncKey(calendarId, new Date('2026-09-01T12:34:00.000Z')),
  );
});
