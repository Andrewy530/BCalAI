import type { Calendar, CalendarEvent } from '@cal/schemas';

import { fetchCalendars, searchEvents } from '../../events/api/events.api';
import { searchTasks, type TaskWithTags } from '../../tasks/api/tasks.api';

export interface SearchData {
  events: CalendarEvent[];
  tasks: TaskWithTags[];
  calendars: Calendar[];
}

/** One combined request boundary for the Search screen. */
export async function searchEverything(query: string): Promise<SearchData> {
  const [events, tasks, calendars] = await Promise.all([
    searchEvents(query),
    searchTasks(query),
    fetchCalendars(),
  ]);

  return { events, tasks, calendars };
}
