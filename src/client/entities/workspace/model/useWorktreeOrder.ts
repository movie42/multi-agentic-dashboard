"use client";

import type { WorktreeSummary } from "@/common/board/types";
import { useStoredList } from "@/client/shared/lib/useStoredList";

const orderKey = (repo: string) => `agent-control:worktree-order:${repo}`;

export interface WorktreeOrder {
  ordered: WorktreeSummary[];
  move: (draggedId: string, targetId: string, placeAfter: boolean) => void;
}

export function sortWorktrees(worktrees: WorktreeSummary[], storedOrder: string[]): WorktreeSummary[] {
  const rank = new Map(storedOrder.map((id, index) => [id, index]));
  return [...worktrees].sort(
    (a, b) =>
      (rank.get(a.worktreeId) ?? storedOrder.length) - (rank.get(b.worktreeId) ?? storedOrder.length) ||
      a.name.localeCompare(b.name) ||
      a.worktreeId.localeCompare(b.worktreeId),
  );
}

export function useWorktreeOrder(repo: string, worktrees: WorktreeSummary[]): WorktreeOrder {
  const [storedOrder, writeOrder] = useStoredList(orderKey(repo));
  const ordered = sortWorktrees(worktrees, storedOrder);
  const move = (draggedId: string, targetId: string, placeAfter: boolean) => {
    const rest = ordered.map((worktree) => worktree.worktreeId).filter((id) => id !== draggedId);
    const at = rest.indexOf(targetId);
    if (at === -1) return;
    writeOrder([...rest.slice(0, at + Number(placeAfter)), draggedId, ...rest.slice(at + Number(placeAfter))]);
  };
  return { ordered, move };
}
