import type { AgentCard } from "@/common/board/types";
import { displayStateOf } from "./classify";
import type { RestOf } from "./useRestOverrides";

/** One 내 차례: a session's turn is identified by when it reached that state. */
export function turnKey(agent: AgentCard): string {
  return `${agent.id}@${agent.stateSince ?? 0}`;
}

/** A 내 차례 nobody clicked yet. `since` keeps turns from before first use from all lighting up at once. */
export function isUnseenTurn(agent: AgentCard, restOf: RestOf, seen: ReadonlySet<string>, since: number): boolean {
  if (agent.agentType === "shell" || displayStateOf(agent, restOf) !== "done") return false;
  if ((agent.stateSince ?? 0) <= since) return false;
  return !seen.has(turnKey(agent));
}

export function withSeen(entries: string[], keys: string[], cap: number): string[] {
  const added = keys.filter((key) => !entries.includes(key));
  return [...entries, ...added].slice(-cap);
}
