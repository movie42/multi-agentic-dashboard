"use client";

import type { AgentCard } from "@/common/board/types";
import { useStoredList } from "@/client/shared/lib/useStoredList";

const MAX_ENTRIES = 300;
const STORAGE_KEY = "agent-control:dismissed";

/** What a person marked a session as by hand: 쉬는 중 or 잠자는 중. */
export type RestKind = "idle" | "dormant";

export type RestOf = (agent: AgentCard) => RestKind | null;

// Keyed by the state's start time, so a mark lasts until the session's state changes.
function restKey(agent: AgentCard): string {
  return `${agent.id}@${agent.stateSince ?? 0}`;
}

function parseEntry(entry: string): { key: string; kind: RestKind } {
  const at = entry.lastIndexOf("=");
  // Entries written before 잠자는 중 existed carry no kind and meant "내 차례에서 내리기".
  if (at < 0) return { key: entry, kind: "idle" };
  return { key: entry.slice(0, at), kind: entry.slice(at + 1) === "dormant" ? "dormant" : "idle" };
}

export interface RestOverrides {
  restOf: RestOf;
  /** null takes the mark off, back to what the session reports. */
  setRest: (agents: AgentCard[], kind: RestKind | null) => void;
}

export function useRestOverrides(): RestOverrides {
  const [entries, write] = useStoredList(STORAGE_KEY);
  const marks = new Map(entries.map((entry) => [parseEntry(entry).key, parseEntry(entry).kind]));

  return {
    restOf: (agent) => (agent.state === "working" ? null : (marks.get(restKey(agent)) ?? null)),
    setRest: (agents, kind) => {
      const keys = new Set(agents.filter((agent) => agent.state !== "working").map(restKey));
      const kept = entries.filter((entry) => !keys.has(parseEntry(entry).key));
      const added = kind ? [...keys].map((key) => `${key}=${kind}`) : [];
      write([...kept, ...added].slice(-MAX_ENTRIES));
    },
  };
}
