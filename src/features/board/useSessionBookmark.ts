"use client";

import { useSyncExternalStore } from "react";
import type { SessionBookmark } from "@/lib/sessions/types";
import { postAction } from "./actions";

// A saved change is shown on every screen until the server's copy (board poll or session list)
// moves away from the value it replaced.
interface Override {
  replaces: string;
  value: SessionBookmark | null;
}

const overrides = new Map<string, Override>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const keyOf = (bookmark: SessionBookmark | null) => JSON.stringify(bookmark);

export interface BookmarkTarget {
  sessionId: string;
  name: string;
  cwd: string | null;
  bookmark: SessionBookmark | null;
}

export function useSessionBookmark(target: BookmarkTarget) {
  const override = useSyncExternalStore(
    subscribe,
    () => overrides.get(target.sessionId),
    () => undefined,
  );
  const bookmark = override && override.replaces === keyOf(target.bookmark) ? override.value : target.bookmark;

  const remember = (value: SessionBookmark | null) => {
    overrides.set(target.sessionId, { replaces: keyOf(target.bookmark), value });
    for (const listener of listeners) listener();
  };

  const save = async (memo: string) => {
    if (!target.cwd) throw new Error("세션 폴더를 몰라 북마크할 수 없어요");
    const name = bookmark?.name ?? target.name;
    await postAction({ type: "bookmark-session", sessionId: target.sessionId, name, cwd: target.cwd, memo });
    const next = { name, memo, createdAt: bookmark?.createdAt ?? "", lastOpenedAt: bookmark?.lastOpenedAt ?? null };
    remember(next);
    return next;
  };

  const remove = async () => {
    await postAction({ type: "unbookmark-session", sessionId: target.sessionId });
    remember(null);
  };

  return { bookmark, save, remove };
}
