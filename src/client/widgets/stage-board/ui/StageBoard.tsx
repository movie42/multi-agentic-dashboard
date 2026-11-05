"use client";

import { useState } from "react";
import type { AgentCard, WorktreeSummary } from "@/common/orca/types";
import { buildSteps, currentStep } from "@/common/workflow/steps";
import type { StepKey, WorkflowMode, WorkflowStep } from "@/common/workflow/types";
import { StateBadge } from "@/client/entities/agent";
import { groupAgents } from "@/client/entities/agent";
import { QuickReply } from "@/client/features/quick-reply";
import { Stepper } from "@/client/entities/workflow";

type StageGroup = "planning" | "tasks-plan" | "build" | "verify" | "test" | "pr" | "finished" | "no-doc";

const GROUP_OF_STEP: Record<StepKey, StageGroup> = {
  prd: "planning",
  grill: "planning",
  plan: "planning",
  "planning-grill": "planning",
  "tasks-plan": "tasks-plan",
  build: "build",
  verify: "verify",
  test: "test",
  pr: "pr",
};

const GROUPS: { key: StageGroup; title: string; hint: string }[] = [
  { key: "planning", title: "기획·질문", hint: "PRD, 질문, 기획·화면 단계" },
  { key: "tasks-plan", title: "계획", hint: "구현 계획 작성·승인" },
  { key: "build", title: "구현", hint: "계획 항목 체크 중" },
  { key: "verify", title: "검증", hint: "화면 확인" },
  { key: "test", title: "테스트", hint: "Phase 검증 명령" },
  { key: "pr", title: "PR", hint: "PR 생성·리뷰·머지 대기" },
  { key: "finished", title: "끝남", hint: "모든 단계가 끝난 작업" },
  { key: "no-doc", title: "flow 문서 없음", hint: "브랜치를 가리키는 flow 작업 문서가 없는 worktree" },
];

interface StageRow {
  id: string;
  worktreeId: string;
  repo: string;
  worktreeName: string;
  title: string | null;
  steps: WorkflowStep[] | null;
  current: WorkflowStep | null;
  needsMe: number;
  working: number;
  replyAgent: AgentCard | null;
}

interface StageBoardProps {
  worktrees: WorktreeSummary[];
  agents: AgentCard[];
  modeOfRepo: (repo: string) => WorkflowMode;
  isDismissed: (agent: AgentCard) => boolean;
  onJump: (repo: string, target: string) => void;
}

const DOT = {
  ask: "bg-ask",
  now: "bg-now",
  wait: "shadow-[inset_0_0_0_1.5px_var(--faint)]",
} as const;

export function StageBoard({ worktrees, agents, modeOfRepo, isDismissed, onJump }: StageBoardProps) {
  const rowsByGroup = new Map<StageGroup, StageRow[]>();
  const push = (group: StageGroup, row: StageRow) =>
    rowsByGroup.set(group, [...(rowsByGroup.get(group) ?? []), row]);

  for (const worktree of worktrees) {
    const own = agents.filter((agent) => agent.worktreeId === worktree.worktreeId);
    const groups = groupAgents(own, isDismissed);
    const replyAgent =
      [...groups.needsMe, ...groups.working, ...groups.resting].find((agent) => agent.terminalHandle) ?? null;
    const base = {
      worktreeId: worktree.worktreeId,
      repo: worktree.repo,
      worktreeName: worktree.name,
      needsMe: groups.needsMe.length,
      working: groups.working.length,
      replyAgent,
    };

    if (worktree.flowTasks.length === 0) {
      if (own.length > 0) {
        push("no-doc", { ...base, id: worktree.worktreeId, title: null, steps: null, current: null });
      }
      continue;
    }
    for (const task of worktree.flowTasks) {
      const steps = buildSteps(modeOfRepo(worktree.repo), task, worktree.pullRequest);
      const current = currentStep(steps);
      push(current ? GROUP_OF_STEP[current.key] : "finished", {
        ...base,
        id: `${worktree.worktreeId}/${task.domain}/${task.taskId}`,
        title: task.title,
        steps,
        current,
      });
    }
  }

  return (
    <>
      {GROUPS.filter((group) => rowsByGroup.has(group.key)).map((group) => {
        const rows = rowsByGroup.get(group.key) ?? [];
        const dot = rows.some((row) => row.current?.status === "ask" || row.needsMe > 0)
          ? DOT.ask
          : rows.some((row) => row.current?.status === "now" || row.working > 0)
            ? DOT.now
            : DOT.wait;
        return (
          <section
            key={group.key}
            className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-hair pt-4 lg:grid-cols-[176px_minmax(0,1fr)]"
          >
            <div>
              <h2 className="flex items-center gap-2 text-[14px] leading-[1.7] font-bold">
                <span className={`size-2 rounded-full ${dot}`} />
                {group.title}
                <span className="font-semibold text-muted">{rows.length}</span>
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{group.hint}</p>
            </div>
            <ul className="min-w-0">
              {rows.map((row) => (
                <StageRowView key={row.id} row={row} onJump={onJump} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

interface StageRowViewProps {
  row: StageRow;
  onJump: (repo: string, target: string) => void;
}

function StageRowView({ row, onJump }: StageRowViewProps) {
  const [replying, setReplying] = useState(false);
  const replyAgent = row.replyAgent;
  const terminalHandle = replyAgent?.terminalHandle ?? null;

  return (
    <li data-jump={row.worktreeId} className="scroll-mt-6">
      <div className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 rounded-lg px-3 hover:bg-tint">
        <button
          type="button"
          onClick={() => onJump(row.repo, row.worktreeId)}
          title="이 프로젝트 화면에서 열기"
          className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-1.5 py-3 text-left xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] xl:items-center"
        >
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{row.title ?? row.worktreeName}</span>
            <span className="block truncate text-[12px] text-muted">
              {row.repo} / {row.worktreeName}
              {row.current?.detail ? ` · ${row.current.label} ${row.current.detail}` : ""}
            </span>
          </span>
          <span className="min-w-0">{row.steps && <Stepper steps={row.steps} size="compact" />}</span>
          <span className="flex gap-3 text-[12px] font-semibold whitespace-nowrap">
            {row.needsMe > 0 && <span className="text-ask">내 차례 {row.needsMe}</span>}
            {row.working > 0 && <span className="text-now">작업 중 {row.working}</span>}
          </span>
        </button>
        {terminalHandle && (
          <button
            type="button"
            aria-pressed={replying}
            onClick={() => setReplying(!replying)}
            className={`shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold ${
              replying ? "bg-fg text-bg" : "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
            }`}
          >
            답장
          </button>
        )}
        <button
          type="button"
          onClick={() => onJump(row.repo, row.worktreeId)}
          title="이 프로젝트 화면에서 열기"
          className="shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
        >
          이동 →
        </button>
      </div>
      {replyAgent && terminalHandle && replying && (
        <div className="flex flex-col gap-2 pt-1 pb-3">
          <p className="flex min-w-0 items-center gap-2 text-[12px] text-muted">
            <StateBadge agent={replyAgent} />
            <span className="truncate">받는 세션 · {replyAgent.prompt ?? replyAgent.agentType ?? "agent"}</span>
          </p>
          <QuickReply terminalHandle={terminalHandle} working={replyAgent.state === "working"} autoFocus />
        </div>
      )}
    </li>
  );
}
