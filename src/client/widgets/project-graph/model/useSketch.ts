"use client";

import { useEffect, useRef, useState } from "react";
import type { SketchItem, SketchResponse } from "@/common/sketch/types";
import { readJson } from "@/client/shared/api/json";

const SAVE_DELAY = 300;
const HISTORY_LIMIT = 100;
const CHANNEL = "agent-control:sketch";

interface History {
  key: string;
  items: SketchItem[];
  past: SketchItem[][];
  future: SketchItem[][];
}

export interface Sketch {
  items: SketchItem[];
  change: (edit: (items: SketchItem[]) => SketchItem[]) => void;
  undo: () => void;
  redo: () => void;
}

const fresh = (key: string, items: SketchItem[] = []): History => ({ key, items, past: [], future: [] });

async function fetchItems(key: string, signal: AbortSignal): Promise<SketchItem[]> {
  const response = await fetch(`/api/sketches?key=${encodeURIComponent(key)}`, { cache: "no-store", signal });
  const body = await readJson<SketchResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.items;
}

/**
 * One canvas's memos and drawings, kept by the daemon so every window and the Dock app see the same.
 * Edits show at once and save a moment later; another window's save reloads this one unless it has
 * an edit of its own still on the way.
 */
export function useSketch(key: string): Sketch {
  const [stored, setStored] = useState<History>(() => fresh(key));
  const history = stored.key === key ? stored : fresh(key);
  /** The newest history, so edits made before a re-render build on each other. */
  const latest = useRef<History>(stored);
  /** Per canvas: the save waiting to go out, and how many saves are on the way. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Map<string, number>());
  /** Bumped on every local edit, so a load that started before one never overwrites it. */
  const edits = useRef(0);
  // One channel for both ends: a channel never hears its own posts, so this window skips its own saves.
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const busy = () => timers.current.has(key) || (inFlight.current.get(key) ?? 0) > 0;
    const request = { controller: new AbortController() };
    const load = () => {
      if (busy()) return;
      request.controller.abort();
      const controller = new AbortController();
      request.controller = controller;
      const startedAt = edits.current;
      fetchItems(key, controller.signal)
        .then((items) => {
          if (busy() || edits.current !== startedAt) return;
          const current = latest.current;
          const next = current.key === key ? { ...current, items } : fresh(key, items);
          latest.current = next;
          setStored(next);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) console.warn("[sketch] load failed", key, error);
        });
    };
    load();
    const listener = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    channel.current = listener;
    listener?.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (event.data === key) load();
    });
    window.addEventListener("focus", load);
    return () => {
      request.controller.abort();
      listener?.close();
      channel.current = null;
      window.removeEventListener("focus", load);
    };
  }, [key]);

  const save = (target: string, items: SketchItem[]) => {
    const waiting = timers.current.get(target);
    if (waiting) clearTimeout(waiting);
    timers.current.set(
      target,
      setTimeout(() => {
        timers.current.delete(target);
        inFlight.current.set(target, (inFlight.current.get(target) ?? 0) + 1);
        fetch("/api/sketches", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: target, items }) })
          .then(async (response) => {
            const body = await readJson<SketchResponse>(response);
            if (!body.ok) throw new Error(body.error);
            channel.current?.postMessage(target);
          })
          .catch((error: unknown) => console.warn("[sketch] save failed", target, error))
          .finally(() => {
            inFlight.current.set(target, (inFlight.current.get(target) ?? 1) - 1);
          });
      }, SAVE_DELAY),
    );
  };

  const current = () => (latest.current.key === key ? latest.current : fresh(key));

  const commit = (base: History, updated: History) => {
    if (updated.items === base.items) return;
    edits.current += 1;
    latest.current = updated;
    setStored(updated);
    save(key, updated.items);
  };

  return {
    items: history.items,
    change: (edit) => {
      const base = current();
      commit(base, { key, items: edit(base.items), past: [...base.past, base.items].slice(-HISTORY_LIMIT), future: [] });
    },
    undo: () => {
      const base = current();
      const previous = base.past.at(-1);
      if (previous) commit(base, { key, items: previous, past: base.past.slice(0, -1), future: [base.items, ...base.future] });
    },
    redo: () => {
      const base = current();
      const [next, ...rest] = base.future;
      if (next) commit(base, { key, items: next, past: [...base.past, base.items], future: rest });
    },
  };
}
