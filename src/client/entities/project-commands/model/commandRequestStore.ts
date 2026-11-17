import { create } from "zustand";
import type { ProjectCommand } from "@/common/appStatus/types";
import type { WorktreeSummary } from "@/common/board/types";

export type CommandRequest =
  | { kind: "run"; worktree: WorktreeSummary; command: ProjectCommand }
  | { kind: "manage"; worktree: WorktreeSummary; mode: "register" | "edit" };

interface CommandRequestState {
  request: CommandRequest | null;
  requestRun: (worktree: WorktreeSummary, command: ProjectCommand) => void;
  requestManage: (worktree: WorktreeSummary, mode: "register" | "edit") => void;
  clear: () => void;
}

export const useCommandRequestStore = create<CommandRequestState>()((set) => ({
  request: null,
  requestRun: (worktree, command) => set({ request: { kind: "run", worktree, command } }),
  requestManage: (worktree, mode) => set({ request: { kind: "manage", worktree, mode } }),
  clear: () => set({ request: null }),
}));

export function requestCommandRun(worktree: WorktreeSummary, command: ProjectCommand): void {
  useCommandRequestStore.getState().requestRun(worktree, command);
}

export function requestCommandManage(worktree: WorktreeSummary, mode: "register" | "edit"): void {
  useCommandRequestStore.getState().requestManage(worktree, mode);
}
