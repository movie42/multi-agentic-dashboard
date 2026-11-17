import type { AgentCard, AgentState } from "@/common/board/types";

export interface BoardGroups {
  needsMe: AgentCard[];
  working: AgentCard[];
  paused: AgentCard[];
  dormant: AgentCard[];
  resting: AgentCard[];
}

export type DisplayState = AgentState | "paused" | "dormant";

/** What one session shows as: blocked and working win over dormant, dormant over paused. */
export function displayStateOf(agent: AgentCard): DisplayState {
  if (agent.state === "working" || needsInput(agent)) return agent.state;
  if (agent.dormant) return "dormant";
  if (agent.interrupted) return "paused";
  return agent.state;
}

function urgency(agent: AgentCard): number {
  if (needsInput(agent)) return 0;
  if (agent.unread) return 1;
  return 2;
}

const byOldestState = (a: AgentCard, b: AgentCard) =>
  (a.stateSince ?? Number.MAX_SAFE_INTEGER) - (b.stateSince ?? Number.MAX_SAFE_INTEGER);

const byRecentUpdate = (a: AgentCard, b: AgentCard) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

export function groupAgents(
  agents: AgentCard[],
  isDismissed: (agent: AgentCard) => boolean,
): BoardGroups {
  const groups: BoardGroups = { needsMe: [], working: [], paused: [], dormant: [], resting: [] };
  for (const agent of agents) {
    const state = displayStateOf(agent);
    if (state === "working") groups.working.push(agent);
    else if (state === "dormant") groups.dormant.push(agent);
    else if (isDismissed(agent)) groups.resting.push(agent);
    else if (state === "paused") groups.paused.push(agent);
    else if (state === "idle") groups.resting.push(agent);
    else groups.needsMe.push(agent);
  }
  groups.needsMe.sort((a, b) => urgency(a) - urgency(b) || byOldestState(a, b));
  groups.working.sort(byOldestState);
  groups.paused.sort(byRecentUpdate);
  groups.dormant.sort(byRecentUpdate);
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
