import { create } from 'zustand';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'agenda';

interface CalendarViewState {
  mode: CalendarViewMode;
  /** The day the calendar is focused on, as a local date key: "2026-08-30". */
  selectedDateKey: string;
  hiddenCalendarIds: string[];

  setMode: (mode: CalendarViewMode) => void;
  setSelectedDateKey: (dateKey: string) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
}

const todayKey = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/**
 * UI-only state: which view is showing and what it is focused on. Events
 * themselves are server state and belong to TanStack Query — never mirror them
 * into a store.
 */
export const useCalendarViewStore = create<CalendarViewState>((set) => ({
  mode: 'week',
  selectedDateKey: todayKey(),
  hiddenCalendarIds: [],

  setMode: (mode) => set({ mode }),
  setSelectedDateKey: (selectedDateKey) => set({ selectedDateKey }),
  toggleCalendarVisibility: (calendarId) =>
    set((state) => ({
      hiddenCalendarIds: state.hiddenCalendarIds.includes(calendarId)
        ? state.hiddenCalendarIds.filter((id) => id !== calendarId)
        : [...state.hiddenCalendarIds, calendarId],
    })),
}));
