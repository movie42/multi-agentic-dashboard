"use client";

import { useEffect } from "react";
import { syncFromStorageEvent, useStoredListStore } from "./storedListStore";

const EMPTY: string[] = [];

export function useStoredList(storageKey: string): [string[], (next: string[]) => void] {
  const list = useStoredListStore((state) => state.lists[storageKey]) ?? EMPTY;

  useEffect(() => {
    useStoredListStore.getState().load(storageKey);
    window.addEventListener("storage", syncFromStorageEvent);
    return () => window.removeEventListener("storage", syncFromStorageEvent);
  }, [storageKey]);

  const write = (next: string[]) => useStoredListStore.getState().write(storageKey, next);
  return [list, write];
}
