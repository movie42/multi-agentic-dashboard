"use client";

import { create } from "zustand";
import type { SessionBookmark } from "@/common/sessions/types";
import { postAction } from "@/client/shared/api/actions";

// A saved change is shown on every screen until the server's copy (board poll or session list)
// moves away from the value it replaced.
interface Override {
  replaces: string;
  value: SessionBookmark | null;
}

interface BookmarkOverrideState {
  overrides: Record<string, Override>;
  remember: (sessionId: string, override: Override) => void;
}

export const useBookmarkOverrides = create<BookmarkOverrideState>()((set) => ({
  overrides: {},
  remember: (sessionId, override) => set((state) => ({ overrides: { ...state.overrides, [sessionId]: override } })),
}));

const keyOf = (bookmark: SessionBookmark | null) => JSON.stringify(bookmark);

export interface BookmarkTarget {
  sessionId: string;
  name: string;
  cwd: string | null;
  bookmark: SessionBookmark | null;
}

export function useSessionBookmark(target: BookmarkTarget) {
  const override = useBookmarkOverrides((state) => state.overrides[target.sessionId]);
  const rememberOverride = useBookmarkOverrides((state) => state.remember);
  const bookmark = override && override.replaces === keyOf(target.bookmark) ? override.value : target.bookmark;

  const remember = (value: SessionBookmark | null) => rememberOverride(target.sessionId, { replaces: keyOf(target.bookmark), value });

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
