import { expandOccurrences } from '../recurrence/expand.ts';

/**
 * The minimal normalized event shape needed to decide which instants are busy.
 * Content such as titles, descriptions, locations, and attendees is
 * intentionally absent: availability and model privacy do not need it.
 */
export interface SchedulingCalendarEvent {
  calendarId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrenceRule: string | null;
  sourceType: 'internal' | 'google' | 'microsoft' | 'device';
  providerEventId: string | null;
  recurringEventId: string | null;
  recurrenceOriginalStartAt: string | null;
}

export interface ExpandedSchedulingEvent<T extends SchedulingCalendarEvent> {
  event: T;
  start: number;
  end: number;
  occurrenceIndex: number;
}

/**
 * Expand local/provider series into the exact event instances that block a
 * window. Provider instance ids are scoped by local calendar id because their
 * opaque values are not globally unique.
 */
export function expandSchedulingCalendarEvents<T extends SchedulingCalendarEvent>(
  events: readonly T[],
  window: { start: Date; end: Date },
): ExpandedSchedulingEvent<T>[] {
  const mastersBySeriesKey = new Map<string, T>();
  const instancesBySeriesKey = new Map<string, T[]>();
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
      if (event.sourceType === 'microsoft') materializedMicrosoftSeries.add(key);
    }
  }

  const expanded: ExpandedSchedulingEvent<T>[] = [];
  for (const event of events) {
    if (event.status === 'cancelled') continue;

    if (event.recurringEventId) {
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

      for (const occurrence of expandOccurrences(
        {
          start: new Date(event.startAt),
          end: new Date(event.endAt),
          timeZone: event.timezone,
          recurrenceRule: event.recurrenceRule,
        },
        window,
      )) {
        const override = instanceByOriginalStart.get(new Date(occurrence.start).toISOString());
        if (override) {
          if (override.status !== 'cancelled') addOneOff(expanded, override, window);
        } else {
          expanded.push({
            event,
            start: occurrence.start,
            end: occurrence.end,
            occurrenceIndex: occurrence.index,
          });
        }
      }
      continue;
    }

    addOneOff(expanded, event, window);
  }

  return expanded.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function schedulingEventsToBusyIntervals(
  events: readonly SchedulingCalendarEvent[],
  window: { start: Date; end: Date },
): { start: number; end: number }[] {
  return expandSchedulingCalendarEvents(events, window).map(({ start, end }) => ({ start, end }));
}

function seriesKey(calendarId: string, providerEventId: string): string {
  return `${calendarId}\u0000${providerEventId}`;
}

function addOneOff<T extends SchedulingCalendarEvent>(
  expanded: ExpandedSchedulingEvent<T>[],
  event: T,
  window: { start: Date; end: Date },
): void {
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  if (end <= window.start.getTime() || start >= window.end.getTime()) return;
  expanded.push({ event, start, end, occurrenceIndex: 0 });
}
