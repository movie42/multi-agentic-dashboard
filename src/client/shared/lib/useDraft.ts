"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch (error) {
    console.warn("[draft] read failed", key, error);
    return "";
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDraft(key: string): [string, (next: string) => void] {
  // The server has no localStorage, so it renders an empty box and the draft fills in after hydration.
  const text = useSyncExternalStore(subscribe, () => read(key), () => "");

  const write = (next: string) => {
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("[draft] write failed", key, error);
    }
    listeners.forEach((listener) => listener());
  };

  return [text, write];
}
