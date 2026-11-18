import type { AgentCard } from "@/common/board/types";
import { displayStateOf, type DisplayState } from "../model/classify";
import { shellStatusLabel, shellStatusOf, type ShellStatus } from "../model/shellStatus";
import { useRestOverrides } from "../model/useRestOverrides";

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

const SHELL_PILL: Record<ShellStatus["kind"], string> = {
  serving: "text-done shadow-[inset_0_0_0_1.5px_var(--st-done)]",
  running: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  failed: "bg-accent text-accent-ink",
};

const PILL = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-semibold whitespace-nowrap";

interface StateBadgeProps {
  agent: AgentCard;
}

export function StateBadge({ agent }: StateBadgeProps) {
  const { restOf } = useRestOverrides();
  const shell = shellStatusOf(agent);
  if (shell) {
    return (
      <span className={`${PILL} ${SHELL_PILL[shell.kind]}`} title={shell.command ? `$ ${shell.command}` : undefined}>
        {shell.kind !== "failed" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
        {shellStatusLabel(shell)}
      </span>
    );
  }
  const state = displayStateOf(agent, restOf);
  const marked = restOf(agent) !== null;
  return (
    <span className={`${PILL} ${STATE_PILL[state]}`} title={marked ? "내가 직접 바꾼 상태예요. 세션 상태가 바뀌면 풀려요" : undefined}>
      {state === "working" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {STATE_LABEL[state]}
    </span>
  );
}
