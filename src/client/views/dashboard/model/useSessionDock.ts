"use client";

import { useEffect } from "react";
import type { AgentCard } from "@/common/board/types";
import { onSessionMessage, requestDock, useSessionDockStore } from "@/client/entities/agent";

const DOCK_TIMEOUT_MS = 3_000;

interface SessionDockOptions {
  /** The window "메인 창으로" sends to; a window opened on one project or worktree is not it. */
  main: boolean;
  agents: readonly AgentCard[] | null;
  selectRepo: (repo: string) => void;
}

/**
 * Where a session sent to this window lands: a canvas on screen that holds it opens it as a panel
 * tab first; when none did, the board moves to the session's project, whose canvas then takes it.
 */
export function useSessionDock({ main, agents, selectRepo }: SessionDockOptions): void {
  const pending = useSessionDockStore((state) => state.pending);
  const hasBoard = agents !== null;

  useEffect(() => {
    if (!main) return;
    return onSessionMessage((message) => {
      if (message.type !== "dock") return;
      requestDock(message.agentId);
      window.focus();
    });
  }, [main]);

  useEffect(() => {
    // A canvas's own effect runs first and settles the request when it holds the session.
    if (pending === null || useSessionDockStore.getState().pending !== pending || !agents) return;
    const agent = agents.find((candidate) => candidate.id === pending);
    if (!agent) {
      useSessionDockStore.getState().settle(pending);
      return;
    }
    selectRepo(agent.repo);
    // A session the project canvas does not draw either would otherwise wait and pop open much later.
    const giveUp = setTimeout(() => useSessionDockStore.getState().settle(pending), DOCK_TIMEOUT_MS);
    return () => clearTimeout(giveUp);
    // Reacts to a new request or the board arriving, not to every board refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, hasBoard]);
}
