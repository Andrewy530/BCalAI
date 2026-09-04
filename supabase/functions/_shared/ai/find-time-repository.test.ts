import { assertEquals } from 'jsr:@std/assert@^1.0.0';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseFindTimeDataSource } from './find-time-repository.ts';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CALENDAR_ID = '22222222-2222-4222-8222-222222222222';

Deno.test('default-calendar query requires a writable internal default', async () => {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select(_columns: string) {
      return this;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    },
  };
  const admin = {
    from(table: string) {
      assertEquals(table, 'calendars');
      return query;
    },
  } as unknown as SupabaseClient;

  const calendar = await supabaseFindTimeDataSource(admin).loadTargetCalendar(USER_ID);

  assertEquals(calendar, null);
  assertEquals(filters, [
    ['user_id', USER_ID],
    ['source_type', 'internal'],
    ['is_default', true],
    ['is_read_only', false],
  ]);
});

Deno.test('event query paginates without truncating blocking rows', async () => {
  const rows = Array.from({ length: 1_001 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    calendar_id: CALENDAR_ID,
    start_at: '2026-09-01T13:00:00.000Z',
    end_at: '2026-09-01T14:00:00.000Z',
    timezone: 'UTC',
    status: 'confirmed',
    recurrence_rule: null,
    source_type: 'internal',
    provider_event_id: null,
    recurring_event_id: null,
    recurrence_original_start_at: null,
  }));
  const ranges: Array<[number, number]> = [];
  const orders: string[][] = [];
  const admin = {
    from(table: string) {
      assertEquals(table, 'events');
      const pageOrders: string[] = [];
      orders.push(pageOrders);
      return {
        select(_columns: string, _options?: { count: 'exact' }) {
          return this;
        },
        eq(_column: string, _value: unknown) {
          return this;
        },
        or(_filter: string) {
          return this;
        },
        order(column: string) {
          pageOrders.push(column);
          return this;
        },
        range(from: number, to: number) {
          ranges.push([from, to]);
          return Promise.resolve({
            data: rows.slice(from, Math.min(to + 1, from + 400)),
            error: null,
            count: rows.length,
          });
        },
      };
    },
  } as unknown as SupabaseClient;

  const events = await supabaseFindTimeDataSource(admin).loadEvents(USER_ID, {
    start: new Date('2026-09-01T00:00:00.000Z'),
    end: new Date('2026-09-02T00:00:00.000Z'),
  });

  assertEquals(events.length, 1_001);
  assertEquals(ranges, [
    [0, 999],
    [400, 1_399],
    [800, 1_799],
  ]);
  assertEquals(orders, [
    ['start_at', 'id'],
    ['start_at', 'id'],
    ['start_at', 'id'],
  ]);
});
