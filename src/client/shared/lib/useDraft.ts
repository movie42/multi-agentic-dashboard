"use client";

import { useSyncExternalStore } from "react";

const changes = new EventTarget();

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch (error) {
    console.warn("[draft] read failed", key, error);
    return "";
  }
}

function subscribe(onChange: () => void): () => void {
  changes.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    changes.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Adds `text` to the end of a stored draft, so a draft box mounted anywhere shows it. */
export function appendDraft(key: string, text: string): void {
  const current = read(key);
  const next = current.trim() ? `${current.trimEnd()} ${text}` : text;
  try {
    window.localStorage.setItem(key, next);
  } catch (error) {
    console.warn("[draft] append failed", key, error);
    throw error;
  }
  changes.dispatchEvent(new Event("change"));
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
    changes.dispatchEvent(new Event("change"));
  };

  return [text, write];
}
