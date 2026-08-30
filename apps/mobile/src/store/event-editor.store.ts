import { create } from 'zustand';

interface EventEditorState {
  isOpen: boolean;
  /** Null means "create a new event". */
  eventId: string | null;
  /** Pre-fills the start time when created from a calendar slot. */
  seedStart: string | null;

  openNew: (seedStart?: Date) => void;
  openEvent: (eventId: string) => void;
  close: () => void;
}

export const useEventEditorStore = create<EventEditorState>((set) => ({
  isOpen: false,
  eventId: null,
  seedStart: null,

  openNew: (seedStart) =>
    set({ isOpen: true, eventId: null, seedStart: seedStart?.toISOString() ?? null }),
  openEvent: (eventId) => set({ isOpen: true, eventId, seedStart: null }),
  close: () => set({ isOpen: false, eventId: null, seedStart: null }),
}));
