"use client";

import { useEffect } from "react";
import type { AgentCard } from "@/common/board/types";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";

const sessionOrderKey = (worktreeId: string) => `agent-control:session-order:${worktreeId}`;

function arrange(agents: AgentCard[], stored: string[]): AgentCard[] {
  const rank = new Map(stored.map((id, index) => [id, index]));
  // A session first seen here goes last; Array.prototype.sort is stable for the rest.
  return [...agents].sort((a, b) => (rank.get(a.id) ?? stored.length) - (rank.get(b.id) ?? stored.length));
}

export function useSessionOrder(worktreeId: string, agents: AgentCard[]) {
  const key = sessionOrderKey(worktreeId);
  const [stored, write] = useStoredList(key);
  const ordered = arrange(agents, stored);
  const ids = ordered.map((agent) => agent.id);
  const idsKey = ids.join("\u0000");

  useEffect(() => {
    // Read the store directly: useStoredList's load effect runs just before this one, so the render value may be stale.
    const current = useStoredListStore.getState().lists[key];
    if (current === undefined) return;
    // Ids are never pruned: a search or a folded worker hides a session for a while, and it must keep its place.
    const known = new Set(current);
    const added = (idsKey ? idsKey.split("\u0000") : []).filter((id) => !known.has(id));
    if (added.length === 0) return;
    useStoredListStore.getState().write(key, [...current, ...added]);
  }, [key, idsKey]);

  const move = (draggedId: string, targetId: string, placeAfter: boolean) => {
    const full = [...stored, ...ids.filter((id) => !stored.includes(id))];
    const rest = full.filter((id) => id !== draggedId);
    const at = rest.indexOf(targetId);
    if (at === -1) return;
    write([...rest.slice(0, at + Number(placeAfter)), draggedId, ...rest.slice(at + Number(placeAfter))]);
  };

  return { ordered, move };
}
