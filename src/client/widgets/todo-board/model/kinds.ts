import type { StatusKind } from "@/common/todos/types";

export const KIND_LABEL: Record<StatusKind, string> = {
  standby: "standby · 대기",
  progress: "progress · 진행",
  block: "block · 막힘",
  review: "review · 리뷰",
  done: "done · 끝",
};

export const KIND_CHIP: Record<StatusKind, string> = {
  standby: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
  progress: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  block: "bg-accent text-accent-ink",
  review: "bg-pr text-st-ink",
  done: "bg-done text-st-ink",
};

export const CARD_DRAG_TYPE = "application/x-todo-card";

/** How long a card keeps its 자동으로 옮겨짐 mark after an auto move. */
export const AUTO_MARK_MS = 10 * 60 * 1000;

export const NO_PROJECT = "@none";

export const KIND_DOT: Record<StatusKind, string> = {
  standby: "bg-faint",
  progress: "bg-now",
  block: "bg-accent",
  review: "bg-pr",
  done: "bg-done",
};
