import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { docLabel, fileLabel } from "../lib/docUrl";

export interface DocTab {
  kind: "doc" | "file";
  /** The page or file the tab was opened with; identifies the tab. */
  target: string;
  /** The page shown now, after links inside the document were followed. A file tab never moves. */
  current: string;
  title: string;
  /** A file tab opened with a single click; the next single click reuses it, as in VS Code. */
  preview: boolean;
}

interface OpenFileOptions {
  preview: boolean;
}

interface DocViewerState {
  tabs: DocTab[];
  active: string | null;
  open: (target: string) => void;
  openFile: (file: string, options: OpenFileOptions) => void;
  pin: (target: string) => void;
  activate: (target: string) => void;
  navigated: (target: string, current: string, title: string | null) => void;
  close: (target: string) => void;
  closeAll: () => void;
}

export const useDocViewerStore = create<DocViewerState>()(
  persist(
    (set) => ({
  tabs: [],
  active: null,
  open: (target) =>
    set((state) => {
      const existing = state.tabs.find((tab) => tab.target === target || tab.current === target);
      if (existing) return { active: existing.target };
      return {
        tabs: [...state.tabs, { kind: "doc", target, current: target, title: docLabel(target), preview: false }],
        active: target,
      };
    }),
  openFile: (file, { preview }) =>
    set((state) => {
      const existing = state.tabs.find((tab) => tab.target === file);
      if (existing) {
        const tabs = preview ? state.tabs : state.tabs.map((tab) => (tab.target === file ? { ...tab, preview: false } : tab));
        return { tabs, active: file };
      }
      const tab: DocTab = { kind: "file", target: file, current: file, title: fileLabel(file), preview };
      const previewIndex = preview ? state.tabs.findIndex((other) => other.preview) : -1;
      if (previewIndex === -1) return { tabs: [...state.tabs, tab], active: file };
      return { tabs: state.tabs.map((other, index) => (index === previewIndex ? tab : other)), active: file };
    }),
  pin: (target) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.target === target ? { ...tab, preview: false } : tab)) })),
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
    }),
    {
      name: "agent-control:doc-tabs",
      version: 1,
      migrate: (persisted) => migrateTabs(persisted),
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tabs: state.tabs, active: state.active }),
      // Rehydrated after mount so the server render and the first client render agree.
      skipHydration: true,
    },
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Version 0 tabs were all documents and had no `kind` or `preview`.
function migrateTabs(persisted: unknown): Pick<DocViewerState, "tabs" | "active"> {
  if (!isRecord(persisted) || !Array.isArray(persisted.tabs)) return { tabs: [], active: null };
  const tabs = persisted.tabs.filter(isRecord).flatMap((tab): DocTab[] =>
    typeof tab.target === "string" && typeof tab.current === "string" && typeof tab.title === "string"
      ? [{ kind: "doc", target: tab.target, current: tab.current, title: tab.title, preview: false }]
      : [],
  );
  const active = typeof persisted.active === "string" ? persisted.active : null;
  return { tabs, active };
}
