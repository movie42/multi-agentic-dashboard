import type { AgentCard } from "@/common/board/types";
import { displayStateOf, type DisplayState } from "../model/classify";

const STATE_LABEL: Record<DisplayState, string> = {
  blocked: "막힘",
  waiting: "내 입력 대기",
  done: "내 차례",
  working: "에이전트 작업 중",
  paused: "멈춤",
  dormant: "잠자는 중",
  idle: "쉬는 중",
};

const STATE_PILL: Record<DisplayState, string> = {
  blocked: "bg-accent text-accent-ink",
  waiting: "bg-accent text-accent-ink",
  done: "bg-ask text-st-ink",
  working: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  paused: "text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]",
  dormant: "text-faint outline-1 -outline-offset-1 outline-dashed outline-faint",
  idle: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
};

interface StateBadgeProps {
  agent: AgentCard;
}

export function StateBadge({ agent }: StateBadgeProps) {
  const state = displayStateOf(agent);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-semibold whitespace-nowrap ${STATE_PILL[state]}`}
    >
      {state === "working" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {STATE_LABEL[state]}
    </span>
  );
}
