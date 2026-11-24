"use client";

import type { AgentCard } from "@/common/board/types";
import {
  displayStateOf,
  permissionModeLabel,
  shellStatusLabel,
  shellStatusOf,
  useRestOverrides,
  UNSEEN_TURN_DOT,
  useUnseenTurns,
  type DisplayState,
  type RestOf,
  type ShellStatus,
} from "@/client/entities/agent";
import { formatElapsed, plainMessage } from "@/client/shared/lib/format";
import type { ConductorScopeKind } from "@/common/orchestration/types";
import { colorKey } from "@/client/features/customize-canvas-color";
import type { GraphNode } from "../model/graph";

const NODE_STATE: Record<DisplayState, { label: string; tone: string; dot: string }> = {
  blocked: { label: "막힘", tone: "border-accent text-accent", dot: "bg-accent" },
  waiting: { label: "내 입력 대기", tone: "border-accent text-accent", dot: "bg-accent" },
  done: { label: "내 차례", tone: "border-ask text-ask", dot: "bg-ask" },
  working: { label: "작업 중", tone: "border-now text-now", dot: "bg-now animate-pulse" },
  paused: { label: "멈춤", tone: "border-accent text-accent", dot: "shadow-[inset_0_0_0_1.5px_var(--accent)]" },
  dormant: { label: "잠자는 중", tone: "border-dashed border-faint text-faint", dot: "shadow-[inset_0_0_0_1.5px_var(--faint)]" },
  idle: { label: "쉬는 중", tone: "border-hair text-muted", dot: "shadow-[inset_0_0_0_1.5px_var(--faint)]" },
};

export function nodeTitle(agent: AgentCard): string {
  // The session title is where a rename lands (the card reads the same field); `agent.title` is unset for live sessions.
  return agent.session?.title ?? agent.title ?? agent.prompt?.split("\n")[0] ?? (agent.agentType === "shell" ? "터미널" : "제목 없음");
}

const SCOPE_TAG: Record<ConductorScopeKind, string> = { app: "앱", project: "프로젝트", worktree: "워크트리" };

const SHELL_TONE: Record<ShellStatus["kind"], { tone: string; dot: string }> = {
  serving: { tone: "border-done text-done", dot: "bg-done animate-pulse" },
  running: { tone: "border-now text-now", dot: "bg-now animate-pulse" },
  failed: { tone: "border-accent text-accent", dot: "bg-accent" },
};

function stateOf(agent: AgentCard, restOf: RestOf) {
  const shell = shellStatusOf(agent);
  return shell ? { label: shellStatusLabel(shell), ...SHELL_TONE[shell.kind] } : NODE_STATE[displayStateOf(agent, restOf)];
}

/** A shell's last line is the command it is running or last ran. */
function detailOf(agent: AgentCard): string {
  const command = agent.shell?.running?.command ?? agent.shell?.lastExit?.command;
  if (command) return `$ ${command}`;
  return plainMessage(agent.lastMessage) || agent.worktreeName;
}

interface NodeBoxProps {
  node: GraphNode;
  now: number;
  selected: boolean;
  /** Worktree names this conductor handed work to. */
  delegatedTo: string[];
  reports: number;
  /** Has a route to another project's worktree, drawn as a port on the canvas. */
  routed: boolean;
  /** Resized taller than the default, so the last message gets every line that fits. */
  roomy?: boolean;
}

/** One session on the canvas: state, elapsed time, title and the last message line. */
export function NodeBox({ node, now, selected, delegatedTo, reports, routed, roomy = false }: NodeBoxProps) {
  const { agent, outside } = node;
  const { restOf } = useRestOverrides();
  const state = stateOf(agent, restOf);
  const unseen = useUnseenTurns().isUnseen(agent);
  const conductor = agent.orchestration?.conductor ?? null;
  const hasMeta = Boolean(agent.model || agent.effort || agent.permissionMode || agent.contextPercent !== null);
  return (
    <div
      data-color-key={colorKey({ scope: "card", id: agent.id })}
      className={`flex h-full flex-col gap-1 overflow-hidden rounded-[10px] border-[1.5px] bg-canvas-card-fill px-3 py-2.5 select-none ${state.tone} ${
        conductor ? "bg-linear-to-b from-now/5 to-now/5" : ""
      } ${outside ? "border-dashed" : ""} ${selected ? "ring-2 ring-fg ring-offset-2 ring-offset-canvas" : ""}`}
    >
      <p className="flex items-center gap-1.5 text-[11px] leading-none font-semibold tracking-[0.02em]">
        <span
          className={`size-1.5 shrink-0 rounded-full ${unseen ? UNSEEN_TURN_DOT : state.dot}`}
          title={unseen ? "아직 확인하지 않은 내 차례" : undefined}
        />
        {conductor && (
          <span className="truncate text-now">
            {outside ? `${outside.repo ? `${outside.repo} 프로젝트` : "앱"} 지휘자 ·` : `지휘자 · ${SCOPE_TAG[conductor.scope.kind]} ·`}
          </span>
        )}
        <span>{state.label}</span>
        <span className="ml-auto font-normal text-canvas-card-soft">{formatElapsed(agent.stateSince, now)}</span>
      </p>
      <p className="truncate text-[14px] leading-snug font-bold text-canvas-card-ink">{nodeTitle(agent)}</p>
      {conductor ? (
        <p className="flex min-w-0 flex-wrap gap-1 text-[11px] leading-none">
          {delegatedTo.map((name) => (
            <span key={name} className="truncate rounded-[5px] bg-now/10 px-1.5 py-1 text-now">
              → {name}
            </span>
          ))}
          {reports > 0 && <span className="rounded-[5px] bg-now/10 px-1.5 py-1 text-now">보고 {reports}</span>}
          {delegatedTo.length === 0 && reports === 0 && !routed && <span className="py-1 text-canvas-card-soft">아직 맡긴 세션이 없어요</span>}
        </p>
      ) : (
        <p className={`text-[12px] text-canvas-card-soft ${roomy ? "min-h-0 flex-1 overflow-hidden leading-relaxed break-words whitespace-pre-line" : "truncate"}`}>
          {detailOf(agent)}
        </p>
      )}
      {hasMeta && (
        <p data-node-meta className="mt-auto truncate text-[11px] leading-none font-medium text-focus tabular-nums">
          {[agent.model, agent.effort, permissionModeLabel(agent.permissionMode), agent.contextPercent !== null ? `컨텍스트 ${agent.contextPercent}%` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {agent.subagents.length > 0 && (
        <p className={`flex min-w-0 items-center ${hasMeta ? "" : "mt-auto"} gap-1.5 text-[11px] leading-none text-now`} title={agent.subagents.map((run) => `${run.description} — ${run.activity ?? "시작하는 중"}`).join("\n")}>
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
          <span className="shrink-0 font-semibold">서브 에이전트 {agent.subagents.length}</span>
          <span className="truncate text-canvas-card-soft">{agent.subagents[0]?.activity ?? agent.subagents[0]?.description}</span>
        </p>
      )}
    </div>
  );
}
