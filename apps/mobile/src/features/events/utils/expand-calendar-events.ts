import { expandSchedulingCalendarEvents } from '@cal/domain';
import type { CalendarEvent } from '@cal/schemas';

/** An event row expanded into one thing the calendar views can draw. */
export interface ExpandedCalendarEvent {
  event: CalendarEvent;
  start: number;
  end: number;
  occurrenceIndex: number;
}

/**
 * Expand local series and apply provider recurrence instances.
 *
 * Google stores a series master plus only changed instances. Microsoft
 * calendarView/delta may store every occurrence in the configured window.
 * The provider-neutral recurrence metadata lets both representations coexist:
 * an instance replaces the matching generated occurrence, while a Microsoft
 * series with materialized instances does not get expanded a second time.
 */
export function expandCalendarEvents(
  events: readonly CalendarEvent[],
  window: { start: Date; end: Date },
): ExpandedCalendarEvent[] {
  return expandSchedulingCalendarEvents(events, window);
}
