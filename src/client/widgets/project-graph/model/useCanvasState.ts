"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { type CanvasState, EMPTY_CANVAS, parseCanvasState } from "./canvasState";

const storageKey = (key: string) => `agent-control:canvas:${key}`;

/** Whose canvas it is: one project, or every project with each drawn as its own frame. */
export type CanvasScope = { kind: "project"; repo: string } | { kind: "all" };

/** The all-projects canvas saves under its own key, apart from every project's. */
export const canvasKey = (scope: CanvasScope) => (scope.kind === "all" ? ":all" : scope.repo);

interface CanvasStore {
  states: Record<string, CanvasState>;
  load: (repo: string) => void;
  write: (repo: string, next: CanvasState) => void;
}

const useCanvasStore = create<CanvasStore>()((set) => ({
  states: {},
  load: (repo) => {
    const raw = (() => {
      try {
        return window.localStorage.getItem(storageKey(repo));
      } catch (error) {
        console.warn("[canvas] read failed", repo, error);
        return null;
      }
    })();
    set((state) => ({ states: { ...state.states, [repo]: parseCanvasState(raw) } }));
  },
  write: (repo, next) => {
    try {
      window.localStorage.setItem(storageKey(repo), JSON.stringify(next));
    } catch (error) {
      console.warn("[canvas] write failed", repo, error);
    }
    set((state) => ({ states: { ...state.states, [repo]: next } }));
  },
}));

/** Where a person put boxes, their sizes, groups and the last view, per canvas, on this machine. */
export function useCanvasState(key: string): [CanvasState, (change: (current: CanvasState) => CanvasState) => void] {
  const state = useCanvasStore((store) => store.states[key]) ?? EMPTY_CANVAS;
  useEffect(() => {
    useCanvasStore.getState().load(key);
  }, [key]);
  // Reads the store at call time, so a delayed write (the saved view) never drops a newer change.
  const update = (change: (current: CanvasState) => CanvasState) => {
    const store = useCanvasStore.getState();
    store.write(key, change(store.states[key] ?? EMPTY_CANVAS));
  };
  return [state, update];
}
