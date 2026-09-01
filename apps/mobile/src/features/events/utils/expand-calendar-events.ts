import { expandOccurrences } from '@cal/domain';
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
  // Provider ids are only unique within a provider account. The local
  // calendar id scopes the relationship so a Google id cannot accidentally
  // override a Microsoft series with the same opaque id (or vice versa).
  const mastersBySeriesKey = new Map<string, CalendarEvent>();
  const instancesBySeriesKey = new Map<string, CalendarEvent[]>();
  const materializedMicrosoftSeries = new Set<string>();

  for (const event of events) {
    if (event.recurrenceRule && event.providerEventId) {
      mastersBySeriesKey.set(seriesKey(event.calendarId, event.providerEventId), event);
    }
    if (event.recurringEventId) {
      const key = seriesKey(event.calendarId, event.recurringEventId);
      const instances = instancesBySeriesKey.get(key) ?? [];
      instances.push(event);
      instancesBySeriesKey.set(key, instances);
      if (event.sourceType === 'microsoft') {
        materializedMicrosoftSeries.add(key);
      }
    }
  }

  const expanded: ExpandedCalendarEvent[] = [];
  for (const event of events) {
    if (event.status === 'cancelled') continue;

    if (event.recurringEventId) {
      // A Google exception is applied while its master is expanded. If the
      // master is absent, or the row came from Microsoft's materialized view,
      // it is already a standalone display row.
      if (
        mastersBySeriesKey.has(seriesKey(event.calendarId, event.recurringEventId)) &&
        event.sourceType !== 'microsoft'
      ) {
        continue;
      }
      addOneOff(expanded, event, window);
      continue;
    }

    if (event.recurrenceRule) {
      if (
        event.sourceType === 'microsoft' &&
        event.providerEventId &&
        materializedMicrosoftSeries.has(seriesKey(event.calendarId, event.providerEventId))
      ) {
        continue;
      }

      const instances = event.providerEventId
        ? (instancesBySeriesKey.get(seriesKey(event.calendarId, event.providerEventId)) ?? [])
        : [];
      const instanceByOriginalStart = new Map(
        instances
          .filter((instance) => instance.recurrenceOriginalStartAt !== null)
          .map((instance) => [instance.recurrenceOriginalStartAt as string, instance]),
      );
      const slices = expandOccurrences(
        {
          start: new Date(event.startAt),
          end: new Date(event.endAt),
          timeZone: event.timezone,
          recurrenceRule: event.recurrenceRule,
        },
        window,
      );

      for (const slice of slices) {
        const override = instanceByOriginalStart.get(new Date(slice.start).toISOString());
        if (override) {
          // A cancelled exception exists only to suppress the generated base
          // occurrence; it is not itself drawable calendar content.
          if (override.status !== 'cancelled') addOneOff(expanded, override, window);
        } else {
          expanded.push({
            event,
            start: slice.start,
            end: slice.end,
            occurrenceIndex: slice.index,
          });
        }
      }
      continue;
    }

    addOneOff(expanded, event, window);
  }

  return expanded.sort((left, right) => left.start - right.start || left.end - right.end);
}

function seriesKey(calendarId: string, providerEventId: string): string {
  return `${calendarId}\u0000${providerEventId}`;
}

function addOneOff(
  expanded: ExpandedCalendarEvent[],
  event: CalendarEvent,
  window: { start: Date; end: Date },
): void {
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  if (end <= window.start.getTime() || start >= window.end.getTime()) return;
  expanded.push({ event, start, end, occurrenceIndex: 0 });
}
