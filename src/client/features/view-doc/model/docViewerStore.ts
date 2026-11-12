import { create } from "zustand";
import { docLabel } from "../lib/docUrl";

export interface DocTab {
  /** The page the tab was opened with; identifies the tab. */
  target: string;
  /** The page shown now, after links inside the document were followed. */
  current: string;
  title: string;
}

interface DocViewerState {
  tabs: DocTab[];
  active: string | null;
  open: (target: string) => void;
  activate: (target: string) => void;
  navigated: (target: string, current: string, title: string | null) => void;
  close: (target: string) => void;
  closeAll: () => void;
}

export const useDocViewerStore = create<DocViewerState>()((set) => ({
  tabs: [],
  active: null,
  open: (target) =>
    set((state) => {
      const existing = state.tabs.find((tab) => tab.target === target || tab.current === target);
      if (existing) return { active: existing.target };
      return { tabs: [...state.tabs, { target, current: target, title: docLabel(target) }], active: target };
    }),
  activate: (target) => set({ active: target }),
  navigated: (target, current, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.target === target ? { ...tab, current, title: title ?? docLabel(current) } : tab)),
    })),
  close: (target) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.target === target);
      const tabs = state.tabs.filter((tab) => tab.target !== target);
      if (state.active !== target) return { tabs };
      const next = tabs[Math.min(index, tabs.length - 1)] ?? null;
      return { tabs, active: next?.target ?? null };
    }),
  closeAll: () => set({ tabs: [], active: null }),
}));
