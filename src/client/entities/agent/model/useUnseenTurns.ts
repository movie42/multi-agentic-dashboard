"use client";

import { useSyncExternalStore } from "react";
import type { AgentCard } from "@/common/board/types";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { isUnseenTurn, turnKey, withSeen } from "./unseenTurn";
import { useRestOverrides } from "./useRestOverrides";

const STORAGE_KEY = "agent-control:seen-turns";
const SINCE_KEY = "agent-control:seen-turns-since";
const MAX_ENTRIES = 300;

const firstUse: { at: number | null } = { at: null };

function firstUseAt(): number {
  if (firstUse.at !== null) return firstUse.at;
  try {
    const stored = Number(window.localStorage.getItem(SINCE_KEY));
    firstUse.at = stored > 0 ? stored : Date.now();
    if (!(stored > 0)) window.localStorage.setItem(SINCE_KEY, String(firstUse.at));
  } catch (error) {
    console.warn("[unseen-turns] first-use read failed", error);
    firstUse.at = Date.now();
  }
  return firstUse.at;
}

/** The dot a not-yet-clicked 내 차례 wears; falls back to the plain 내 차례 colour under reduced motion. */
export const UNSEEN_TURN_DOT = "bg-ask animate-turn-rainbow motion-reduce:animate-none";

const NEVER_CHANGES = () => () => {};
// The server cannot read the first-use time, so it renders nothing unseen; hydration then re-renders
// with the stored time. Reading it during render instead leaves the server's class on the dot for good.
const SERVER_FIRST_USE = () => Number.POSITIVE_INFINITY;

export interface UnseenTurns {
  isUnseen: (agent: AgentCard) => boolean;
  markSeen: (agents: AgentCard[]) => void;
}

/** 내 차례 sessions the person has not clicked since the turn arrived. */
export function useUnseenTurns(): UnseenTurns {
  const [entries, write] = useStoredList(STORAGE_KEY);
  const { restOf } = useRestOverrides();
  const since = useSyncExternalStore(NEVER_CHANGES, firstUseAt, SERVER_FIRST_USE);
  const seen = new Set(entries);
  const isUnseen = (agent: AgentCard) => isUnseenTurn(agent, restOf, seen, since);
  return {
    isUnseen,
    markSeen: (agents) => {
      const keys = agents.filter(isUnseen).map(turnKey);
      if (keys.length > 0) write(withSeen(entries, keys, MAX_ENTRIES));
    },
  };
}
