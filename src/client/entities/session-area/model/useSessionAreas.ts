"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { parseAreas, type SessionArea } from "./areas";

const storageKey = (worktreeId: string) => `agent-control:session-areas:${worktreeId}`;
const KEY_PREFIX = storageKey("");

type AreaChange = (current: SessionArea[]) => SessionArea[];

interface AreaStore {
  byWorktree: Record<string, SessionArea[]>;
  load: (worktreeId: string) => void;
  update: (worktreeId: string, change: AreaChange) => void;
}

function read(worktreeId: string): SessionArea[] {
  try {
    return parseAreas(window.localStorage.getItem(storageKey(worktreeId)));
  } catch (error) {
    console.warn("[session-areas] read failed", worktreeId, error);
    return [];
  }
}

const useAreaStore = create<AreaStore>()((set, get) => ({
  byWorktree: {},
  load: (worktreeId) => set((state) => ({ byWorktree: { ...state.byWorktree, [worktreeId]: read(worktreeId) } })),
  update: (worktreeId, change) => {
    const next = change(get().byWorktree[worktreeId] ?? read(worktreeId));
    try {
      window.localStorage.setItem(storageKey(worktreeId), JSON.stringify(next));
    } catch (error) {
      console.warn("[session-areas] write failed", worktreeId, error);
    }
    set((state) => ({ byWorktree: { ...state.byWorktree, [worktreeId]: next } }));
  },
}));

/** Another window (a session window, the Dock app's second window) changed a worktree's areas. */
function syncFromStorage(event: StorageEvent): void {
  const { byWorktree, load } = useAreaStore.getState();
  if (event.key === null) Object.keys(byWorktree).forEach(load);
  else if (event.key.startsWith(KEY_PREFIX)) load(event.key.slice(KEY_PREFIX.length));
}

const EMPTY: SessionArea[] = [];

export interface WorktreeAreas {
  areasOf: (worktreeId: string) => SessionArea[];
  update: (worktreeId: string, change: AreaChange) => void;
}

/** The areas of several worktrees at once, for the canvas that draws every worktree of a project. */
export function useWorktreeAreas(worktreeIds: string[]): WorktreeAreas {
  const byWorktree = useAreaStore((state) => state.byWorktree);
  const idsKey = worktreeIds.join("\u0000");
  useEffect(() => {
    const { load } = useAreaStore.getState();
    worktreeIds.forEach(load);
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the set of worktrees changes
  }, [idsKey]);
  return {
    areasOf: (worktreeId) => byWorktree[worktreeId] ?? EMPTY,
    update: (worktreeId, change) => useAreaStore.getState().update(worktreeId, change),
  };
}

/** One worktree's areas, saved on this machine and shared by the session tabs and the canvas. */
export function useSessionAreas(worktreeId: string): [SessionArea[], (change: AreaChange) => void] {
  const { areasOf, update } = useWorktreeAreas([worktreeId]);
  return [areasOf(worktreeId), (change) => update(worktreeId, change)];
}
