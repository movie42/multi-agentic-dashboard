import { create } from "zustand";

interface RowSelection {
  ids: string[];
  toggle: (id: string) => void;
  clear: () => void;
}

/** Rows picked with ⌘/Ctrl/Shift-click, shared by every list on the page so a pick spans sections. */
export const useRowSelection = create<RowSelection>((set) => ({
  ids: [],
  toggle: (id) => set((state) => ({ ids: state.ids.includes(id) ? state.ids.filter((picked) => picked !== id) : [...state.ids, id] })),
  clear: () => set((state) => (state.ids.length === 0 ? state : { ids: [] })),
}));
