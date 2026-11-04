import type { AgentCard, AgentState } from "@/lib/orca/types";

const STATE_LABEL: Record<AgentState, string> = {
  blocked: "막힘",
  waiting: "내 입력 대기",
  done: "내 차례",
  working: "에이전트 작업 중",
  idle: "쉬는 중",
};

const STATE_PILL: Record<AgentState, string> = {
  blocked: "bg-accent text-accent-ink",
  waiting: "bg-accent text-accent-ink",
  done: "bg-ask text-st-ink",
  working: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  idle: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
};

interface StateBadgeProps {
  agent: AgentCard;
}

export function StateBadge({ agent }: StateBadgeProps) {
  const interrupted = agent.interrupted && agent.state !== "working";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-semibold whitespace-nowrap ${
        interrupted ? "bg-accent text-accent-ink" : STATE_PILL[agent.state]
      }`}
    >
      {agent.state === "working" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {interrupted ? "중단됨" : STATE_LABEL[agent.state]}
    </span>
  );
}
