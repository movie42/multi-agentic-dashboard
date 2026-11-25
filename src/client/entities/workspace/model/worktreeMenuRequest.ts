"use client";

import { useEffect, useRef } from "react";
import type { MenuPoint } from "@/client/shared/ui/ContextMenu";

/** Worktree actions whose form lives in the worktree panel, so another screen can only ask for them. */
export type PanelWorktreeAction = "worktree";

type Payload = { kind: "menu"; at: MenuPoint } | { kind: "action"; action: PanelWorktreeAction };

interface PanelRequest {
  worktreeId: string;
  payload: Payload;
  requestedAt: number;
}

const STALE_MS = 1500;

/** The panel for a worktree may only mount after the selection switches, so the request waits here. */
class PanelRequests extends EventTarget {
  private pending: PanelRequest | null = null;

  send(worktreeId: string, payload: Payload): void {
    this.pending = { worktreeId, payload, requestedAt: Date.now() };
    this.dispatchEvent(new Event("request"));
  }

  take(worktreeId: string): Payload | null {
    const request = this.pending;
    if (!request || request.worktreeId !== worktreeId) return null;
    this.pending = null;
    return Date.now() - request.requestedAt <= STALE_MS ? request.payload : null;
  }
}

const requests = new PanelRequests();

/** Ask the worktree's panel to open its menu at a point, e.g. from a right-click in the sidebar. */
export function requestWorktreeMenu(worktreeId: string, at: MenuPoint): void {
  requests.send(worktreeId, { kind: "menu", at });
}

/** Ask the worktree's panel to run one of its menu actions, e.g. from the canvas menu. */
export function requestWorktreeAction(worktreeId: string, action: PanelWorktreeAction): void {
  requests.send(worktreeId, { kind: "action", action });
}

/** Handles requests for this worktree as they arrive, including one sent just before mount. */
export function useWorktreeMenuRequest(
  worktreeId: string,
  onOpen: (at: MenuPoint) => void,
  onAction: (action: PanelWorktreeAction) => void,
): void {
  const handlers = useRef({ onOpen, onAction });
  useEffect(() => {
    handlers.current = { onOpen, onAction };
  });

  useEffect(() => {
    const take = () => {
      const payload = requests.take(worktreeId);
      if (payload?.kind === "menu") handlers.current.onOpen(payload.at);
      if (payload?.kind === "action") handlers.current.onAction(payload.action);
    };
    take();
    requests.addEventListener("request", take);
    return () => requests.removeEventListener("request", take);
  }, [worktreeId]);
}
