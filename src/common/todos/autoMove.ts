import { statusIndex, statusOf } from "./board";
import type { TodoAutoEvent, TodoBoard, TodoCard } from "./types";

const TARGET_KIND = { "session-started": "progress", "pr-opened": "review" } as const;

/** Auto moves only go forward and never move a card that already sits on a done-kind status. */
export function autoMoveTarget(board: TodoBoard, card: TodoCard, event: TodoAutoEvent): string | null {
  const target = board.statuses.find((status) => status.kind === TARGET_KIND[event]);
  if (!target || statusOf(board, card.statusId)?.kind === "done") return null;
  return statusIndex(board, target.id) > statusIndex(board, card.statusId) ? target.id : null;
}
