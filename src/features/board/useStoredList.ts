"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parseList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function useStoredList(storageKey: string): [string[], (next: string[]) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey) ?? "[]";
      } catch (error) {
        console.warn("[stored-list] read failed", storageKey, error);
        return "[]";
      }
    },
    () => "[]",
  );

  const write = (next: string[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch (error) {
      console.warn("[stored-list] write failed", storageKey, error);
    }
    listeners.forEach((listener) => listener());
  };

  return [parseList(raw), write];
}
