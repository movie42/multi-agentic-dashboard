import { create } from "zustand";
import type { AgentCard } from "@/common/orca/types";

/** Orca can take a while to start Claude; past this the launch is assumed lost and the placeholder goes away. */
export const PENDING_LAUNCH_TTL_MS = 90_000;

export interface PendingLaunch {
  id: string;
  worktreePath: string;
  /** Top-level sessions the worktree already had, so the launched one is the first id outside this set. */
  knownIds: string[];
  at: number;
}

interface PendingLaunchState {
  pending: PendingLaunch[];
  start: (worktreePath: string, agents: AgentCard[], now?: number) => string;
  cancel: (id: string) => void;
  /** Drops each placeholder whose session has shown up on the board, and those past the TTL. */
  settle: (agents: AgentCard[], now?: number) => void;
}

const topLevelIn = (agents: AgentCard[], worktreePath: string) =>
  agents.filter((agent) => agent.parentId === null && agent.worktreePath === worktreePath);

export const usePendingLaunchStore = create<PendingLaunchState>((set, get) => ({
  pending: [],
  start: (worktreePath, agents, now = Date.now()) => {
    const id = crypto.randomUUID();
    const knownIds = topLevelIn(agents, worktreePath).map((agent) => agent.id);
    set({ pending: [...get().pending, { id, worktreePath, knownIds, at: now }] });
    return id;
  },
  cancel: (id) => set({ pending: get().pending.filter((entry) => entry.id !== id) }),
  settle: (agents, now = Date.now()) => {
    const { pending } = get();
    if (pending.length === 0) return;
    const claimed = new Set<string>();
    const remaining = pending.filter((entry) => {
      if (now - entry.at > PENDING_LAUNCH_TTL_MS) return false;
      const arrived = topLevelIn(agents, entry.worktreePath).find(
        (agent) => !entry.knownIds.includes(agent.id) && !claimed.has(agent.id),
      );
      if (!arrived) return true;
      claimed.add(arrived.id);
      return false;
    });
    if (remaining.length !== pending.length) set({ pending: remaining });
  },
}));

export function usePendingLaunches(worktreePath: string): PendingLaunch[] {
  const pending = usePendingLaunchStore((state) => state.pending);
  return pending.filter((entry) => entry.worktreePath === worktreePath);
}
