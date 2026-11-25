import { create } from "zustand";
import type { WorktreeSummary } from "@/common/board/types";

export interface RemoveWorktreeRequest {
  worktree: WorktreeSummary;
  /** Agent sessions attached to the worktree; removal closes their terminals. */
  sessionCount: number;
}

interface RemoveWorktreeRequestState {
  request: RemoveWorktreeRequest | null;
  clear: () => void;
}

export const useRemoveWorktreeRequest = create<RemoveWorktreeRequestState>()((set) => ({
  request: null,
  clear: () => set({ request: null }),
}));

/** Opens the removal modal over whatever screen is showing, without switching to the worktree. */
export function requestRemoveWorktree(worktree: WorktreeSummary, sessionCount: number): void {
  if (worktree.isMain) return;
  useRemoveWorktreeRequest.setState({ request: { worktree, sessionCount } });
}
