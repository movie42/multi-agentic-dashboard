import { create } from "zustand";

interface StoredListState {
  lists: Record<string, string[]>;
  load: (key: string) => void;
  write: (key: string, next: string[]) => void;
}

export function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readStorage(key: string): string[] {
  try {
    return parseList(window.localStorage.getItem(key));
  } catch (error) {
    console.warn("[stored-list] read failed", key, error);
    return [];
  }
}

export const useStoredListStore = create<StoredListState>()((set) => ({
  lists: {},
  load: (key) => set((state) => ({ lists: { ...state.lists, [key]: readStorage(key) } })),
  write: (key, next) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.warn("[stored-list] write failed", key, error);
    }
    set((state) => ({ lists: { ...state.lists, [key]: next } }));
  },
}));

export function syncFromStorageEvent(event: StorageEvent): void {
  const { lists, load } = useStoredListStore.getState();
  if (event.key === null) Object.keys(lists).forEach(load);
  else if (event.key in lists) load(event.key);
}
