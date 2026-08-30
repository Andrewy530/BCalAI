import { create } from 'zustand';

interface TaskEditorState {
  isOpen: boolean;
  /** Null means "create a new task". */
  taskId: string | null;
  defaultListId: string | null;

  openNew: (defaultListId?: string | null) => void;
  openTask: (taskId: string) => void;
  close: () => void;
}

/**
 * The task editor is reachable from the inbox, from Today, and from Quick Add,
 * so which task it is editing is UI state that outlives any one screen.
 */
export const useTaskEditorStore = create<TaskEditorState>((set) => ({
  isOpen: false,
  taskId: null,
  defaultListId: null,

  openNew: (defaultListId = null) => set({ isOpen: true, taskId: null, defaultListId }),
  openTask: (taskId) => set({ isOpen: true, taskId, defaultListId: null }),
  close: () => set({ isOpen: false, taskId: null, defaultListId: null }),
}));
