"use client";

import type { AgentCard } from "@/lib/orca/types";
import { useStoredList } from "./useStoredList";

const MAX_ENTRIES = 300;

function dismissKey(agent: AgentCard): string {
  return `${agent.id}@${agent.stateSince ?? 0}`;
}

export interface DismissedState {
  isDismissed: (agent: AgentCard) => boolean;
  dismiss: (agent: AgentCard) => void;
  restore: (agent: AgentCard) => void;
}

export function useDismissed(): DismissedState {
  const [keys, write] = useStoredList("agent-control:dismissed");

  return {
    isDismissed: (agent) => keys.includes(dismissKey(agent)),
    dismiss: (agent) => write([...keys, dismissKey(agent)].slice(-MAX_ENTRIES)),
    restore: (agent) => write(keys.filter((key) => key !== dismissKey(agent))),
  };
}
