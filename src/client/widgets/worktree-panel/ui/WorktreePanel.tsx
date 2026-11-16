"use client";

import { useEffect, useRef, useState } from "react";
import { gitGraphHref } from "@/client/entities/git-graph";
import { intentDiffHref } from "@/client/entities/intent-diff";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import { buildSteps } from "@/common/workflow/steps";
import type {
  FeatureRowSummary,
  JiraIssueInfo,
  PullRequestInfo,
  StepStatus,
  WorkflowMode,
  WorkflowStep,
} from "@/common/workflow/types";
import type { BoardGroups } from "@/client/entities/agent";
import { Stepper } from "@/client/entities/workflow";
import { useWorktreeWizard, WorktreeWizardPanel, wizardOrigin } from "@/client/features/create-worktree";
import { useWorktreeMenuRequest } from "@/client/entities/workspace";
import { ConductorLauncher } from "@/client/features/conduct-sessions";
import { PendingLaunchRows } from "@/client/features/launch-agent";
import { RemoveWorktree } from "@/client/features/remove-worktree";
import { WorktreeNameForm } from "@/client/features/rename-worktree";
import { useFileExplorerStore } from "@/client/features/browse-files";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { useScrolledPast } from "../model/useScrolledPast";
import { useSessionOrder } from "../model/useSessionOrder";

interface WorktreePanelProps {
  worktree: WorktreeSummary;
  featureRow: FeatureRowSummary | null;
  mode: WorkflowMode;
  groups: BoardGroups;
  renderAgents: (
    agents: AgentCard[],
    onReorder: (draggedId: string, targetId: string, placeAfter: boolean) => void,
    needsMeIds: ReadonlySet<string>,
  ) => React.ReactNode;
  /** Open terminals of every session in this worktree, orchestrated workers included. */
  terminalHandles: string[];
  onAction: (action: ActionRequest) => Promise<void>;
}

interface WorktreeAction {
  key: keyof typeof ACTION_ICONS;
  label: string;
  description: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

const MENU_WIDTH = 288;

const STRIP_PX = 32;

const STRIP_DOT: Record<StepStatus, string> = {
  done: "bg-done",
  now: "bg-now",
  ask: "bg-ask",
  wait: "bg-faint",
  skip: "bg-faint opacity-50",
};

function currentStepIndex(steps: WorkflowStep[]): number {
  const active = steps.findIndex((step) => step.status === "now" || step.status === "ask");
  if (active >= 0) return active;
  const firstWaiting = steps.findIndex((step) => step.status === "wait");
  return firstWaiting >= 0 ? firstWaiting : steps.length - 1;
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
  renderAgents,
  terminalHandles,
  onAction,
}: WorktreePanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Shown until the next poll brings the new display name back.
  const [savedName, setSavedName] = useState<{ value: string; replaces: string } | null>(null);
  const shownName = savedName && savedName.replaces === worktree.name ? savedName.value : worktree.name;
  const [menu, setMenu] = useState<{ at: MenuPoint; confirmingCloseAll: boolean } | null>(null);
  const closeMenu = () => setMenu(null);
  const openMenu = (at: MenuPoint) => setMenu({ at, confirmingCloseAll: false });
  useWorktreeMenuRequest(worktree.worktreeId, openMenu);
  const pr = worktree.pullRequest;
  const [filter, setFilter] = useState<PanelFilter | null>(null);
  const wizard = useWorktreeWizard(wizardOrigin(worktree, true));
  const [launchingConductor, setLaunchingConductor] = useState(false);
  const activeFilter = filter && groups[filter].length > 0 ? filter : null;
  const sessions = useSessionOrder(worktree.worktreeId, [
    ...groups.needsMe,
    ...groups.working,
    ...groups.resting,
  ]);
  const all = sessions.ordered;
  const listed = activeFilter
    ? all.filter((agent) => groups[activeFilter].includes(agent))
    : all;
  const actions: WorktreeAction[] = [
    {
      key: "session",
      label: "새 세션",
      description: "이 워크트리에 빈 에이전트 세션을 띄워요",
      run: () => void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" }),
    },
    {
      key: "conductor",
      label: "지휘자",
      description: "이 워크트리와 하위 워크트리에 일을 나눠 맡기는 세션을 띄워요",
      run: () => setLaunchingConductor(true),
    },
    {
      key: "terminal",
      label: "터미널",
      description: "이 워크트리에 셸 터미널을 새 탭으로 열어요",
      run: () => void onAction({ type: "open-terminal", worktreePath: worktree.path }),
    },
    {
      key: "diff",
      label: "변경 읽기",
      description: "갈라진 지점 이후 바뀐 코드를 새 창에서 읽어요",
      run: () => window.open(intentDiffHref({ worktreePath: worktree.path }), "_blank", "noopener"),
    },
    {
      key: "graph",
      label: "깃 그래프",
      description: "이 워크트리를 기준으로 커밋 흐름을 새 창에서 봐요",
      run: () => window.open(gitGraphHref(worktree.path), "_blank", "noopener"),
    },
    {
      key: "worktree",
      label: "여기서 워크트리 만들기",
      description: "이 브랜치에서 갈라지는 새 작업 폴더를 만들어요",
      disabled: wizard.busy,
      run: () => wizard.open(),
    },
    {
      key: "rename",
      label: "이름 바꾸기",
      description: "보드에 보이는 이름만 바꿔요. 폴더와 브랜치는 그대로예요",
      run: () => setEditingName(true),
    },
    ...(worktree.isMain
      ? []
      : [
          {
            key: "remove" as const,
            label: "워크트리 삭제",
            description: "이 워크트리를 지워요. 브랜치는 남아요",
            danger: true,
            run: () => setRemoving(true),
          },
        ]),
  ];
  const open = (target: string) =>
    onAction({ type: "open-artifact", target });
  const showFiles = useFileExplorerStore((state) => state.show);
  const filesButton = (size: "strip" | "header") => (
    <button
      type="button"
      onClick={() => showFiles(worktree.path)}
      aria-label="파일 탐색"
      title="파일 탐색 (⌘P로 이름 찾기)"
      className={`shrink-0 cursor-pointer rounded-md text-muted hover:bg-tint-2 hover:text-fg ${size === "strip" ? "ml-2 p-0.5" : "p-1"}`}
    >
      {ACTION_ICONS.files}
    </button>
  );

  useEffect(() => {
    const explorer = useFileExplorerStore.getState();
    if (explorer.treeOpen && explorer.root !== worktree.path) explorer.show(worktree.path);
  }, [worktree.path]);
  const [markOverviewEnd, overviewHidden] = useScrolledPast<HTMLDivElement>(STRIP_PX);
  const [peekOpen, setPeekOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const leadTask = worktree.flowTasks[0] ?? null;
  const leadSteps = leadTask ? buildSteps(mode, leadTask, pr) : [];
  const leadIndex = currentStepIndex(leadSteps);
  const leadStep = leadSteps[leadIndex] ?? null;

  const peekShown = peekOpen && overviewHidden;

  useEffect(() => {
    if (!peekShown) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && stripRef.current?.contains(event.target)) return;
      setPeekOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPeekOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [peekShown]);

  return (
    <section data-jump={worktree.worktreeId} className="flex min-w-0 flex-col gap-5 [--strip-h:2rem] [--tabs-h:2.5rem]">
      <div ref={stripRef} className="sticky top-0 z-30 -mb-5 h-0">
        <div
          aria-hidden={!overviewHidden}
          inert={!overviewHidden}
          className={`absolute inset-x-0 top-0 -mx-3 flex h-[var(--strip-h)] min-w-0 items-center bg-bg px-3 transition-opacity duration-150 ${
            overviewHidden ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => setPeekOpen((value) => !value)}
            aria-expanded={peekShown}
            title={leadTask ? `${leadTask.title} · 개요 펼치기` : "개요 펼치기"}
            className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left text-[12px] leading-none"
          >
            <span className="shrink-0 font-bold">{shownName}</span>
            {leadStep && (
              <>
                <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
                  {leadSteps.map((step) => (
                    <span key={step.key} className={`size-1.5 rounded-full ${STRIP_DOT[step.status]}`} />
                  ))}
                </span>
                <span className="shrink-0 font-semibold">
                  {leadIndex + 1}/{leadSteps.length} {leadStep.label}
                </span>
                <span className="truncate text-muted">{leadTask?.title}</span>
              </>
            )}
            <span aria-hidden className={`shrink-0 text-muted transition-transform ${peekShown ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {filesButton("strip")}
          {leadTask?.pageIndex && (
            <button
              type="button"
              onClick={() => leadTask.pageIndex && open(leadTask.pageIndex)}
              aria-label="문서 열기"
              title="문서 열기"
              className="ml-2 shrink-0 cursor-pointer rounded-md p-0.5 text-muted hover:bg-tint-2 hover:text-fg"
            >
              {ACTION_ICONS.doc}
            </button>
          )}
          <button
            type="button"
            aria-label={`${worktree.name} 워크트리 메뉴`}
            aria-expanded={menu !== null}
            title="워크트리 메뉴"
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu({ x: rect.right - MENU_WIDTH, y: rect.bottom + 4 });
            }}
            className="ml-1 shrink-0 cursor-pointer rounded-md p-0.5 text-muted hover:bg-tint-2 hover:text-fg"
          >
            {ACTION_ICONS.menu}
          </button>
        </div>
        {peekShown && (
          <div className="absolute inset-x-0 top-[var(--strip-h)] -mx-3 flex max-h-[70vh] flex-col gap-6 overflow-y-auto border-b border-hair bg-bg px-3 pt-3 pb-5 shadow-[0_12px_16px_-12px_var(--hair)]">
            <FlowOverview worktree={worktree} mode={mode} pr={pr} onOpen={(target) => void open(target)} />
            <button
              type="button"
              onClick={() => {
                setPeekOpen(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="self-start text-[12px] text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
            >
              맨 위로
            </button>
          </div>
        )}
      </div>
      <header
        onContextMenu={(event: React.MouseEvent<HTMLElement>) => {
          if (event.target instanceof HTMLElement && event.target.closest("a, button, input, textarea")) return;
          event.preventDefault();
          openMenu({ x: event.clientX, y: event.clientY });
        }}
        className="flex flex-col gap-1.5"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {editingName ? (
            <WorktreeNameForm
              worktree={worktree}
              onDone={(saved) => {
                setEditingName(false);
                if (saved) setSavedName({ value: saved, replaces: worktree.name });
              }}
            />
          ) : (
            <h2 className="min-w-0 text-[22px] leading-[1.3] font-bold tracking-[-0.015em] break-all">{shownName}</h2>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {filesButton("header")}
            <button
              type="button"
              aria-label={`${worktree.name} 워크트리 메뉴`}
              aria-expanded={menu !== null}
              title="워크트리 메뉴 · 우클릭으로도 열려요"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu({ x: rect.right - MENU_WIDTH, y: rect.bottom + 4 });
              }}
              className="shrink-0 cursor-pointer rounded-md p-1 text-muted hover:bg-tint-2 hover:text-fg"
            >
              {ACTION_ICONS.menu}
            </button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] empty:hidden">
          {worktree.branch && worktree.branch !== worktree.name && (
            <span className="font-mono break-all text-muted">{worktree.branch}</span>
          )}
          {pr.kind === "found" && (
            <button
              type="button"
              onClick={() => open(pr.url)}
              className="text-[13px] underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              PR #{pr.number} 열기
            </button>
          )}
          <JiraLine jira={worktree.jira} featureRow={featureRow} onOpen={(url) => void open(url)} />
          {FILTER_OPTIONS.filter((option) => groups[option.key].length > 0).map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={activeFilter === option.key}
              onClick={() => setFilter(activeFilter === option.key ? null : option.key)}
              className={`-mx-0.5 rounded-full px-2 py-0.5 ${option.tone} ${
                activeFilter === option.key ? "bg-tint font-semibold" : "hover:bg-tint"
              }`}
            >
              {option.label} {groups[option.key].length}
            </button>
          ))}
        </div>
        {removing && <RemoveWorktree worktree={worktree} sessionCount={all.length} onCancel={() => setRemoving(false)} />}
        {menu && (
          <ContextMenu at={menu.at} label={`${worktree.name} 워크트리 메뉴`} onClose={closeMenu} widthClass="w-72">
            {menu.confirmingCloseAll ? (
              <div className="flex flex-col gap-2 p-2">
                <p>이 워크트리의 세션 {terminalHandles.length}개를 닫을까요?</p>
                <p className="text-[12px] text-muted">세션 기록은 남아서 세션 목록에서 다시 열 수 있어요.</p>
                <div className="flex justify-end gap-1.5">
                  <MenuItem onSelect={closeMenu}>취소</MenuItem>
                  <MenuItem
                    tone="danger"
                    onSelect={() => {
                      closeMenu();
                      void onAction({ type: "close-terminals", terminalHandles });
                    }}
                  >
                    모두 닫기
                  </MenuItem>
                </div>
              </div>
            ) : (
              <>
                <MenuHeading>{worktree.name} 워크트리에서</MenuHeading>
                {actions.map((action) => (
                  <MenuItem
                    key={action.key}
                    icon={ACTION_ICONS[action.key]}
                    tone={action.danger ? "danger" : "default"}
                    description={action.description}
                    disabled={action.disabled}
                    onSelect={() => {
                      closeMenu();
                      action.run();
                    }}
                  >
                    {action.label}
                  </MenuItem>
                ))}
                {terminalHandles.length > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuItem
                      tone="danger"
                      description="기록은 세션 목록에 남아요"
                      hint={`${terminalHandles.length}개`}
                      onSelect={() => setMenu({ ...menu, confirmingCloseAll: true })}
                    >
                      세션 모두 닫기
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </ContextMenu>
        )}
      </header>

      <div className="flex min-w-0 flex-col gap-6">
        <WorktreeWizardPanel wizard={wizard} />
        {launchingConductor && (
          <ConductorLauncher
            worktreePath={worktree.path}
            scope="worktree"
            scopeName={worktree.name}
            onClose={() => setLaunchingConductor(false)}
          />
        )}
        <FlowOverview worktree={worktree} mode={mode} pr={pr} onOpen={(target) => void open(target)} />

        <div ref={markOverviewEnd} aria-hidden className="-mb-6 h-0" />
        <div className="empty:hidden">
          {listed.length > 0 && renderAgents(listed, sessions.move, new Set(groups.needsMe.map((agent) => agent.id)))}
          <PendingLaunchRows worktreePath={worktree.path} standalone={listed.length === 0} />
        </div>
      </div>
    </section>
  );
}

interface FlowOverviewProps {
  worktree: WorktreeSummary;
  mode: WorkflowMode;
  pr: PullRequestInfo;
  onOpen: (target: string) => void;
}

function FlowOverview({ worktree, mode, pr, onOpen }: FlowOverviewProps) {
  const open = onOpen;
  return (
    <>
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
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px]">
                <span className="font-semibold">{task.title}</span>
                <span className="whitespace-nowrap font-mono text-[12px] text-muted">
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

    </>
  );
}

interface JiraLineProps {
  jira: JiraIssueInfo;
  featureRow: FeatureRowSummary | null;
  onOpen: (url: string) => void;
}

function JiraLine({ jira, featureRow, onOpen }: JiraLineProps) {
  const key =
    jira.kind === "not-applicable" ? (featureRow?.issue ?? null) : jira.key;
  const url = jira.kind === "not-applicable" ? null : jira.url;
  const status =
    jira.kind === "found"
      ? jira.status
      : jira.kind === "loading"
        ? "Jira 확인 중"
        : jira.kind === "unknown"
          ? "Jira 조회 실패"
          : (featureRow?.jiraStatus ?? null);
  const todo = featureRow?.jiraTodo ?? null;
  if (!key && !todo) return null;
  return (
    <span className="text-[12px]">
      {key &&
        (url ? (
          <button
            type="button"
            onClick={() => onOpen(url)}
            className="font-mono underline decoration-faint underline-offset-[3px] hover:decoration-current"
          >
            {key}
          </button>
        ) : (
          <span className="font-mono text-muted">{key}</span>
        ))}
      {key && status && <span className="text-muted"> · {status}</span>}
      {todo && <span className="ml-2 text-ask">사람이 옮길 것 · {todo}</span>}
    </span>
  );
}
