"use client";

import { useState } from "react";
import { intentDiffHref } from "@/features/intentDiff/useIntentDiff";
import type { ActionRequest } from "@/lib/orca/actions";
import type { AgentCard, WorktreeSummary } from "@/lib/orca/types";
import { buildSteps } from "@/lib/workflow/steps";
import type {
  FeatureRowSummary,
  PullRequestInfo,
  WorkflowMode,
} from "@/lib/workflow/types";
import type { BoardGroups } from "./classify";
import { AgentList } from "./AgentList";
import { Stepper } from "./Stepper";
import { useWorktreeWizard, WorktreeWizardPanel, wizardOrigin } from "./WorktreeWizard";

interface WorktreePanelProps {
  worktree: WorktreeSummary;
  featureRow: FeatureRowSummary | null;
  mode: WorkflowMode;
  groups: BoardGroups;
  now: number;
  renderCard: (agent: AgentCard) => React.ReactNode;
  workersOf: (agent: AgentCard) => AgentCard[];
  ancestors: WorktreeLink[];
  childLinks: WorktreeLink[];
  expandedId: string | null;
  onAction: (action: ActionRequest) => void;
}

export interface WorktreeLink {
  worktreeId: string;
  name: string;
  needsMe: number;
  working: number;
}

const INDENT = ["", "pl-3.5", "pl-7"] as const;
const indentOf = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)];

const scrollToWorktree = (worktreeId: string) =>
  document
    .querySelector<HTMLElement>(`[data-jump="${CSS.escape(worktreeId)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

function Elbow() {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block h-2.5 w-2 -translate-y-1 border-b border-l border-muted"
    />
  );
}

type PanelFilter = "needsMe" | "working";

const FILTER_OPTIONS: { key: PanelFilter; label: string; tone: string }[] = [
  { key: "needsMe", label: "내 차례", tone: "text-ask" },
  { key: "working", label: "작업 중", tone: "text-now" },
];

export function WorktreePanel({
  worktree,
  featureRow,
  mode,
  groups,
  now,
  renderCard,
  workersOf,
  ancestors,
  childLinks,
  expandedId,
  onAction,
}: WorktreePanelProps) {
  const pr = worktree.pullRequest;
  const [filter, setFilter] = useState<PanelFilter | null>(null);
  const wizard = useWorktreeWizard(wizardOrigin(worktree, true));
  const activeFilter = filter && groups[filter].length > 0 ? filter : null;
  const all = [...groups.needsMe, ...groups.working, ...groups.resting];
  const listed = activeFilter ? groups[activeFilter] : all;
  const terminalHandle =
    all.find((agent) => agent.terminalHandle)?.terminalHandle ?? null;
  const toTerminal = () =>
    onAction(
      terminalHandle
        ? { type: "focus-terminal", terminalHandle }
        : { type: "open-terminal", worktreePath: worktree.path },
    );
  const open = (target: string) =>
    onAction({
      type: "open-artifact",
      target,
      via: "system",
      worktreePath: worktree.path,
    });

  return (
    <section
      data-jump={worktree.worktreeId}
      className="grid scroll-mt-6 grid-cols-1 gap-x-6 gap-y-4 border-t border-hair pt-6 pb-10 lg:grid-cols-[176px_minmax(0,1fr)]"
    >
      <div className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        {ancestors.map((ancestor, depth) => (
          <button
            key={ancestor.worktreeId}
            type="button"
            onClick={() => scrollToWorktree(ancestor.worktreeId)}
            title={`${ancestor.name} 워크트리로 이동해요`}
            className={`block max-w-full truncate text-left text-[13px] leading-[1.6] text-muted hover:text-current ${indentOf(depth)}`}
          >
            {depth > 0 && <Elbow />}
            {ancestor.name}
          </button>
        ))}
        <h3
          className={`text-[17px] leading-[1.35] font-bold tracking-[-0.01em] break-all ${indentOf(ancestors.length)}`}
        >
          {ancestors.length > 0 && <Elbow />}
          {worktree.name}
        </h3>
        {worktree.branch && worktree.branch !== worktree.name && (
          <p className="mt-1 font-mono text-[12px] break-all text-muted">
            {worktree.branch}
          </p>
        )}
        <p className="mt-2 flex flex-wrap gap-x-1 text-[12px]">
          {FILTER_OPTIONS.filter((option) => groups[option.key].length > 0).map(
            (option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={activeFilter === option.key}
                onClick={() =>
                  setFilter(activeFilter === option.key ? null : option.key)
                }
                className={`-mx-0.5 rounded-full px-2 py-0.5 ${option.tone} ${
                  activeFilter === option.key
                    ? "bg-tint font-semibold"
                    : "hover:bg-tint"
                }`}
              >
                {option.label} {groups[option.key].length}
              </button>
            ),
          )}
        </p>
        {pr.kind === "found" && (
          <button
            type="button"
            onClick={() => open(pr.url)}
            className="mt-2 text-[13px] underline decoration-faint underline-offset-[3px] hover:decoration-current"
          >
            PR #{pr.number} 열기
          </button>
        )}
        {featureRow &&
          (featureRow.issue ||
            featureRow.jiraStatus ||
            featureRow.jiraTodo) && (
            <p className="mt-2 text-[12px]">
              {featureRow.issue && (
                <span className="font-mono text-muted">
                  {featureRow.issue}{" "}
                </span>
              )}
              <span>{featureRow.jiraStatus ?? "Jira 상태 기록 없음"}</span>
              {featureRow.jiraTodo && (
                <span className="block text-ask">
                  사람이 옮길 것 · {featureRow.jiraTodo}
                </span>
              )}
            </p>
          )}
        <p className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          <button
            type="button"
            onClick={() =>
              onAction({
                type: "launch-agent",
                worktreePath: worktree.path,
                prompt: "",
              })
            }
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            새 세션
          </button>
          <button
            type="button"
            onClick={toTerminal}
            title={
              terminalHandle
                ? "에이전트 터미널로 이동해요"
                : "이 워크트리에 새 터미널을 열어요"
            }
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            터미널로
          </button>
          <a
            href={intentDiffHref({ worktreePath: worktree.path })}
            target="_blank"
            rel="noreferrer"
            title="분기점 이후 변경을 계획 항목 → 의도 순서로 새 창에서 읽어요"
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            변경 읽기
          </a>
          <button
            type="button"
            onClick={wizard.open}
            title="에이전트가 어떤 작업인지 묻고, 이 브랜치에서 새 워크트리를 만들어요"
            className="rounded-full border border-hair px-2.5 py-0.5 hover:bg-tint"
          >
            여기서 워크트리
          </button>
        </p>
        {childLinks.length > 0 && (
          <div className="mt-4 text-[13px]">
            <p
              className="text-[12px] text-muted"
              title="Orca에서 이 워크트리 아래로 만든 워크트리"
            >
              하위 워크트리 {childLinks.length}
            </p>
            <ul className="mt-1">
              {childLinks.map((child) => (
                <li key={child.worktreeId}>
                  <button
                    type="button"
                    onClick={() => scrollToWorktree(child.worktreeId)}
                    title={`${child.name} 워크트리로 이동해요`}
                    className="flex max-w-full items-baseline py-0.5 text-left hover:underline"
                  >
                    <Elbow />
                    <span className="mr-1.5 truncate">{child.name}</span>
                    {child.needsMe > 0 && (
                      <span className="shrink-0 text-[12px] text-ask">
                        {child.needsMe}
                      </span>
                    )}
                    {child.needsMe === 0 && child.working > 0 && (
                      <span className="shrink-0 text-[12px] text-now">
                        {child.working}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <WorktreeWizardPanel wizard={wizard} />
        {worktree.flowTasks.length === 0 ? (
          <p className="text-[14px] text-muted">
            진행 중인 flow 작업 문서가 없어요.
          </p>
        ) : (
          worktree.flowTasks.map((task) => {
            const pageIndex = task.pageIndex;
            return (
              <div
                key={`${task.domain}/${task.taskId}`}
                className="flex flex-col gap-3"
              >
                <p className="flex items-baseline gap-2 text-[15px]">
                  <span className="font-semibold">{task.title}</span>
                  <span className="font-mono text-[12px] text-muted">
                    {task.domain}/{task.taskId}
                  </span>
                  {pageIndex && (
                    <button
                      type="button"
                      onClick={() => open(pageIndex)}
                      className="ml-auto shrink-0 text-[13px] underline decoration-faint underline-offset-[3px] hover:decoration-current"
                    >
                      문서 열기
                    </button>
                  )}
                </p>
                {task.branch !== worktree.branch && (
                  <p className="-mt-2 text-[12px] text-muted">
                    문서에 기록된 브랜치는{" "}
                    <span className="font-mono">{task.branch ?? "없음"}</span>
                    이에요
                  </p>
                )}
                <Stepper steps={buildSteps(mode, task, pr)} size="full" />
              </div>
            );
          })
        )}

        {worktree.otherFlowTasks.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted hover:text-current">
              다른 flow 문서 {worktree.otherFlowTasks.length}
            </summary>
            <ul className="mt-3 flex flex-col gap-4">
              {worktree.otherFlowTasks.map((task) => {
                const pageIndex = task.pageIndex;
                const taskPr: PullRequestInfo =
                  task.branch === worktree.branch
                    ? pr
                    : { kind: "not-applicable" };
                return (
                  <li
                    key={`${task.domain}/${task.taskId}`}
                    className="flex flex-col gap-1.5"
                  >
                    <p className="flex items-baseline gap-2">
                      <span>{task.title}</span>
                      <span className="font-mono text-[12px] text-muted">
                        {task.domain}/{task.taskId}
                        {task.branch && ` · ${task.branch}`}
                      </span>
                      {pageIndex ? (
                        <button
                          type="button"
                          onClick={() => open(pageIndex)}
                          className="ml-auto shrink-0 underline decoration-faint underline-offset-[3px] hover:decoration-current"
                        >
                          열기
                        </button>
                      ) : (
                        <span className="ml-auto shrink-0 text-muted">
                          빌드 필요
                        </span>
                      )}
                    </p>
                    <Stepper
                      steps={buildSteps(mode, task, taskPr)}
                      size="compact"
                    />
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {listed.length > 0 && (
          <AgentList
            agents={listed}
            now={now}
            showRepo={false}
            renderCard={renderCard}
            expandedId={expandedId}
            workersOf={workersOf}
          />
        )}
      </div>
    </section>
  );
}
