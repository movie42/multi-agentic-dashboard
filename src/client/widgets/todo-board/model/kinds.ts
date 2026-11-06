import type { TodoBoard } from "@/common/todos/types";

export type StatusTone = "first" | "middle" | "last";

export function statusTone(board: TodoBoard, statusId: string): StatusTone {
  if (board.statuses[0]?.id === statusId) return "first";
  if (board.statuses.at(-1)?.id === statusId) return "last";
  return "middle";
}

export const TONE_CHIP: Record<StatusTone, string> = {
  first: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
  middle: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  last: "bg-done text-st-ink",
};

export const TONE_DOT: Record<StatusTone, string> = {
  first: "bg-faint",
  middle: "bg-now",
  last: "bg-done",
};

export const CARD_DRAG_TYPE = "application/x-todo-card";

/** How long a card keeps its 에이전트가 옮김 mark after an agent moved it. */
export const AGENT_MARK_MS = 10 * 60 * 1000;

export const NO_PROJECT = "@none";
