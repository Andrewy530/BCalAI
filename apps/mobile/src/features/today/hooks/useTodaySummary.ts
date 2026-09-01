import {
  addZonedDays,
  bucketTasks,
  calculateFreeTime,
  deviceTimeZone,
  startOfZonedDay,
  toZonedDateKey,
  type FreeTimeSummary,
  type TaskBuckets,
} from '@cal/domain';
import type { Calendar, CalendarEvent, Task, TaskList } from '@cal/schemas';
import { useEffect, useMemo, useState } from 'react';

import { useCalendarViewStore } from '../../../store/calendar-view.store';
import { useCalendars } from '../../events/hooks/useCalendars';
import { useEventsInWindow } from '../../events/hooks/useEvents';
import { expandCalendarEvents } from '../../events/utils/expand-calendar-events';
import { useProfile } from '../../settings/hooks/useProfile';
import { useTaskLists, useTasks } from '../../tasks/hooks/useTasks';

export interface TodayEventOccurrence {
  key: string;
  event: CalendarEvent;
  calendar: Calendar | undefined;
  start: number;
  end: number;
  occurrenceIndex: number;
}

export type TodayTimelineItem =
  | {
      kind: 'event';
      key: string;
      start: number;
      end: number;
      occurrence: TodayEventOccurrence;
    }
  | {
      kind: 'task';
      key: string;
      start: number;
      end: number;
      task: Task;
    };

export interface TodaySummary {
  todayKey: string;
  dayStart: Date;
  dayEnd: Date;
  now: Date;
  fullName: string | null | undefined;
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  tasks: Task[];
  taskLists: TaskList[];
  buckets: TaskBuckets;
  /** Flexible tasks with an estimate that do not have a scheduled block. */
  unscheduled: Task[];
  eventOccurrences: TodayEventOccurrence[];
  timeline: TodayTimelineItem[];
  next: TodayTimelineItem | null;
  freeTime: FreeTimeSummary;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The Today data boundary.
 *
 * It loads the same server collections used by the existing inbox and
 * calendar, then derives one timezone-aware view model for the screen. The
 * screen never needs to know how recurring events are expanded or how free
 * time is calculated.
 */
export function useTodaySummary(): TodaySummary {
  const [now, setNow] = useState(() => new Date());
  const hiddenCalendarIds = useCalendarViewStore((state) => state.hiddenCalendarIds);

  // A minute tick keeps "up next" and timed task labels honest while the app
  // remains open, without re-fetching the server on every tick.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const profileQuery = useProfile();
  const timeZone = profileQuery.data?.timezone ?? deviceTimeZone();
  const dayStart = useMemo(() => startOfZonedDay(now, timeZone), [now, timeZone]);
  const dayEnd = useMemo(() => addZonedDays(dayStart, 1, timeZone), [dayStart, timeZone]);
  const todayKey = toZonedDateKey(dayStart, timeZone);

  const tasksQuery = useTasks();
  const taskListsQuery = useTaskLists();
  const calendarsQuery = useCalendars();
  const eventsQuery = useEventsInWindow(dayStart, dayEnd);

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const taskLists = useMemo(() => taskListsQuery.data ?? [], [taskListsQuery.data]);
  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);

  const eventOccurrences = useMemo(() => {
    const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
    const hidden = new Set(hiddenCalendarIds);
    const expanded: TodayEventOccurrence[] = [];

    for (const item of expandCalendarEvents(eventsQuery.data ?? [], {
      start: dayStart,
      end: dayEnd,
    })) {
      const calendar = calendarById.get(item.event.calendarId);
      if (hidden.has(item.event.calendarId) || calendar?.isVisible === false) continue;

      expanded.push({
        key: `${item.event.id}:${item.occurrenceIndex}`,
        event: item.event,
        calendar,
        start: item.start,
        end: item.end,
        occurrenceIndex: item.occurrenceIndex,
      });
    }

    return expanded.sort((a, b) => a.start - b.start || a.end - b.end);
  }, [calendars, dayEnd, dayStart, eventsQuery.data, hiddenCalendarIds]);

  const buckets = useMemo(() => bucketTasks(tasks, now, timeZone), [tasks, now, timeZone]);

  const unscheduled = useMemo(
    () =>
      buckets.unscheduled.filter(
        (task) => task.status === 'open' && task.isFlexible && task.estimatedMinutes !== null,
      ),
    [buckets.unscheduled],
  );

  const timeline = useMemo(() => {
    const items: TodayTimelineItem[] = eventOccurrences.map((occurrence) => ({
      kind: 'event',
      key: occurrence.key,
      start: occurrence.start,
      end: occurrence.end,
      occurrence,
    }));

    const eventById = new Map<string, TodayEventOccurrence>();
    for (const occurrence of eventOccurrences) {
      if (!eventById.has(occurrence.event.id)) eventById.set(occurrence.event.id, occurrence);
    }

    for (const task of tasks) {
      if (task.status === 'completed' || task.status === 'archived') continue;

      const timedDueAt = task.dueAt && task.hasDueTime ? new Date(task.dueAt) : null;
      const scheduledEvent = task.scheduledEventId
        ? eventById.get(task.scheduledEventId)
        : undefined;
      const start = timedDueAt ? timedDueAt.getTime() : (scheduledEvent?.start ?? null);

      if (start === null || start < dayStart.getTime() || start >= dayEnd.getTime()) continue;
      if (timedDueAt && toZonedDateKey(timedDueAt, timeZone) !== todayKey) continue;

      const durationMinutes = Math.max(task.estimatedMinutes ?? 30, 15);
      items.push({
        kind: 'task',
        key: `task:${task.id}`,
        start,
        end: start + durationMinutes * 60_000,
        task,
      });
    }

    return items.sort((a, b) => a.start - b.start || (a.kind === 'event' ? -1 : 1));
  }, [dayEnd, dayStart, eventOccurrences, tasks, timeZone, todayKey]);

  const next = useMemo(
    () => timeline.find((item) => item.end > now.getTime()) ?? null,
    [now, timeline],
  );

  const freeTime = useMemo(
    () =>
      calculateFreeTime({
        dayStart,
        dayEnd,
        now,
        timeZone,
        workingHours: profileQuery.data?.workingHours ?? [],
        busy: eventOccurrences.map((occurrence) => ({
          start: occurrence.start,
          end: occurrence.end,
        })),
      }),
    [dayEnd, dayStart, eventOccurrences, now, profileQuery.data?.workingHours, timeZone],
  );

  return {
    todayKey,
    dayStart,
    dayEnd,
    now,
    fullName: profileQuery.data?.fullName,
    timeZone,
    hourCycle: profileQuery.data?.hourCycle ?? 'h23',
    tasks,
    taskLists,
    buckets,
    unscheduled,
    eventOccurrences,
    timeline,
    next,
    freeTime,
    isLoading:
      profileQuery.isLoading ||
      tasksQuery.isLoading ||
      taskListsQuery.isLoading ||
      calendarsQuery.isLoading ||
      eventsQuery.isLoading,
    isError:
      profileQuery.isError ||
      tasksQuery.isError ||
      taskListsQuery.isError ||
      calendarsQuery.isError ||
      eventsQuery.isError,
    refetch: () => {
      void Promise.all([
        profileQuery.refetch(),
        tasksQuery.refetch(),
        taskListsQuery.refetch(),
        calendarsQuery.refetch(),
        eventsQuery.refetch(),
      ]);
    },
  };
}
