import type { AgentCard } from "@/common/board/types";

export interface BoardGroups {
  needsMe: AgentCard[];
  working: AgentCard[];
  resting: AgentCard[];
}

function urgency(agent: AgentCard): number {
  if (agent.state === "blocked" || agent.state === "waiting") return 0;
  if (agent.interrupted) return 1;
  if (agent.unread) return 2;
  return 3;
}

export function awaitsUser(agent: AgentCard): boolean {
  if (agent.state === "working") return false;
  if (agent.state === "idle") return agent.interrupted;
  return true;
}

const byOldestState = (a: AgentCard, b: AgentCard) =>
  (a.stateSince ?? Number.MAX_SAFE_INTEGER) - (b.stateSince ?? Number.MAX_SAFE_INTEGER);

const byRecentUpdate = (a: AgentCard, b: AgentCard) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

export function groupAgents(
  agents: AgentCard[],
  isDismissed: (agent: AgentCard) => boolean,
): BoardGroups {
  const groups: BoardGroups = { needsMe: [], working: [], resting: [] };
  for (const agent of agents) {
    if (agent.state === "working") groups.working.push(agent);
    else if (awaitsUser(agent) && !isDismissed(agent)) groups.needsMe.push(agent);
    else groups.resting.push(agent);
  }
  groups.needsMe.sort((a, b) => urgency(a) - urgency(b) || byOldestState(a, b));
  groups.working.sort(byOldestState);
  groups.resting.sort(byRecentUpdate);
  return groups;
}

export interface FoldedAgents {
  top: AgentCard[];
  foldedIds: ReadonlySet<string>;
  workersOf: (agent: AgentCard) => AgentCard[];
}

// A worker answers to its coordinator, so it leaves the top level
// unless it waits on a human (blocked prompt) or its coordinator is no longer on the board.
export function needsInput(agent: AgentCard): boolean {
  return agent.state === "blocked" || agent.state === "waiting";
}

export function foldWorkers(agents: AgentCard[]): FoldedAgents {
  const ids = new Set(agents.map((agent) => agent.id));
  const byCoordinator = new Map<string, AgentCard[]>();
  const top: AgentCard[] = [];
  const foldedIds = new Set<string>();
  for (const agent of agents) {
    const coordinatorId = agent.parentId;
    if (coordinatorId && coordinatorId !== agent.id && ids.has(coordinatorId) && !needsInput(agent)) {
      byCoordinator.set(coordinatorId, [...(byCoordinator.get(coordinatorId) ?? []), agent]);
      foldedIds.add(agent.id);
    } else {
      top.push(agent);
    }
  }
  return { top, foldedIds, workersOf: (agent) => byCoordinator.get(agent.id) ?? [] };
}
