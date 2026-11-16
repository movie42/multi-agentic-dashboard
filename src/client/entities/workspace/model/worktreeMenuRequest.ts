"use client";

import { useEffect, useRef } from "react";
import type { MenuPoint } from "@/client/shared/ui/ContextMenu";

interface MenuRequest {
  worktreeId: string;
  at: MenuPoint;
  requestedAt: number;
}

const STALE_MS = 1500;

/** The panel for a worktree may only mount after the selection switches, so the request waits here. */
class MenuRequests extends EventTarget {
  private pending: MenuRequest | null = null;

  send(worktreeId: string, at: MenuPoint): void {
    this.pending = { worktreeId, at, requestedAt: Date.now() };
    this.dispatchEvent(new Event("request"));
  }

  take(worktreeId: string): MenuPoint | null {
    const request = this.pending;
    if (!request || request.worktreeId !== worktreeId) return null;
    this.pending = null;
    return Date.now() - request.requestedAt <= STALE_MS ? request.at : null;
  }
}

const requests = new MenuRequests();

/** Ask the worktree's panel to open its menu at a point, e.g. from a right-click in the sidebar. */
export function requestWorktreeMenu(worktreeId: string, at: MenuPoint): void {
  requests.send(worktreeId, at);
}

/** Opens the menu when a request for this worktree arrives, including one sent just before mount. */
export function useWorktreeMenuRequest(worktreeId: string, onOpen: (at: MenuPoint) => void): void {
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });

  useEffect(() => {
    const take = () => {
      const at = requests.take(worktreeId);
      if (at) openRef.current(at);
    };
    take();
    requests.addEventListener("request", take);
    return () => requests.removeEventListener("request", take);
  }, [worktreeId]);
}
