"use client";

import type { AgentCard } from "@/common/board/types";
import { displayStateOf, type DisplayState } from "@/client/entities/agent";
import { formatElapsed, plainMessage } from "@/client/shared/lib/format";
import type { ConductorScopeKind } from "@/common/orchestration/types";
import type { ElsewhereWorkers, GraphNode } from "../model/graph";

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

function stateOf(agent: AgentCard) {
  return NODE_STATE[displayStateOf(agent)];
}

interface NodeBoxProps {
  node: GraphNode;
  now: number;
  selected: boolean;
  /** Worktree names this conductor handed work to. */
  delegatedTo: string[];
  reports: number;
  /** Workers this conductor has in other projects. */
  elsewhere: ElsewhereWorkers[];
  onOpenProject: (repo: string) => void;
}

/** One session on the canvas: state, elapsed time, title and the last message line. */
export function NodeBox({ node, now, selected, delegatedTo, reports, elsewhere, onOpenProject }: NodeBoxProps) {
  const { agent, outside } = node;
  const state = stateOf(agent);
  const conductor = agent.orchestration?.conductor ?? null;
  const hasMeta = Boolean(agent.model || agent.effort || agent.contextPercent !== null);
  return (
    <div
      className={`flex h-full flex-col gap-1 overflow-hidden rounded-[10px] border-[1.5px] px-3 py-2.5 select-none ${state.tone} ${
        conductor ? "bg-now/5" : "bg-bg"
      } ${outside ? "border-dashed" : ""} ${selected ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
    >
      <p className="flex items-center gap-1.5 text-[11px] leading-none font-semibold tracking-[0.02em]">
        <span className={`size-1.5 shrink-0 rounded-full ${state.dot}`} />
        {conductor && (
          <span className="truncate text-now">
            {outside ? `${outside.repo ? `${outside.repo} 프로젝트` : "앱"} 지휘자 ·` : `지휘자 · ${SCOPE_TAG[conductor.scope.kind]} ·`}
          </span>
        )}
        <span>{state.label}</span>
        <span className="ml-auto font-normal text-muted">{formatElapsed(agent.stateSince, now)}</span>
      </p>
      <p className="truncate text-[14px] leading-snug font-bold text-fg">{nodeTitle(agent)}</p>
      {conductor ? (
        <p className="flex min-w-0 flex-wrap gap-1 text-[11px] leading-none">
          {delegatedTo.map((name) => (
            <span key={name} className="truncate rounded-[5px] bg-now/10 px-1.5 py-1 text-now">
              → {name}
            </span>
          ))}
          {reports > 0 && <span className="rounded-[5px] bg-now/10 px-1.5 py-1 text-now">보고 {reports}</span>}
          {elsewhere.map((entry) => (
            <button
              key={entry.repo}
              type="button"
              onClick={() => onOpenProject(entry.repo)}
              title={`${entry.repo} 프로젝트 캔버스로 가기`}
              className="truncate rounded-[5px] px-1.5 py-1 text-now shadow-[inset_0_0_0_1px_currentColor] hover:bg-now/10"
            >
              다른 프로젝트 일꾼 {entry.count} · {entry.repo} ↗
            </button>
          ))}
          {delegatedTo.length === 0 && reports === 0 && elsewhere.length === 0 && <span className="py-1 text-muted">아직 맡긴 세션이 없어요</span>}
        </p>
      ) : (
        <p className="truncate text-[12px] text-muted">{plainMessage(agent.lastMessage) || agent.worktreeName}</p>
      )}
      {hasMeta && (
        <p data-node-meta className="mt-auto truncate text-[11px] leading-none font-medium text-focus tabular-nums">
          {[agent.model, agent.effort, agent.contextPercent !== null ? `컨텍스트 ${agent.contextPercent}%` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {agent.subagents.length > 0 && (
        <p className={`flex min-w-0 items-center ${hasMeta ? "" : "mt-auto"} gap-1.5 text-[11px] leading-none text-now`} title={agent.subagents.map((run) => `${run.description} — ${run.activity ?? "시작하는 중"}`).join("\n")}>
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
          <span className="shrink-0 font-semibold">서브 에이전트 {agent.subagents.length}</span>
          <span className="truncate text-muted">{agent.subagents[0]?.activity ?? agent.subagents[0]?.description}</span>
        </p>
      )}
    </div>
  );
}
