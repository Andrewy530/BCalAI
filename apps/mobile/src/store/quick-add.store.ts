import { create } from 'zustand';

export type QuickAddMode = 'task' | 'event' | 'block';

interface QuickAddState {
  isOpen: boolean;
  mode: QuickAddMode;
  /** Pre-fills the date when opened from a specific day in the calendar. */
  seedDateKey: string | null;

  open: (mode?: QuickAddMode, seedDateKey?: string) => void;
  close: () => void;
  setMode: (mode: QuickAddMode) => void;
}

export const useQuickAddStore = create<QuickAddState>((set) => ({
  isOpen: false,
  mode: 'task',
  seedDateKey: null,

  open: (mode = 'task', seedDateKey) => set({ isOpen: true, mode, seedDateKey: seedDateKey ?? null }),
  close: () => set({ isOpen: false, seedDateKey: null }),
  setMode: (mode) => set({ mode }),
}));
