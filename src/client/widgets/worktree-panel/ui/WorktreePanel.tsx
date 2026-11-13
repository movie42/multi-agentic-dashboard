"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { gitGraphHref } from "@/client/entities/git-graph";
import { intentDiffHref } from "@/client/entities/intent-diff";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/orca/types";
import { buildSteps } from "@/common/workflow/steps";
import type {
  FeatureRowSummary,
  JiraIssueInfo,
  PullRequestInfo,
  WorkflowMode,
} from "@/common/workflow/types";
import type { BoardGroups } from "@/client/entities/agent";
import { Stepper } from "@/client/entities/workflow";
import { useWorktreeWizard, WorktreeWizardPanel, wizardOrigin } from "@/client/features/create-worktree";
import { PendingLaunchRows } from "@/client/features/launch-agent";
import { RemoveWorktree } from "@/client/features/remove-worktree";
import { WorktreeNameForm } from "@/client/features/rename-worktree";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { useSessionOrder } from "../model/useSessionOrder";

interface WorktreePanelProps {
  worktree: WorktreeSummary;
  featureRow: FeatureRowSummary | null;
  mode: WorkflowMode;
  groups: BoardGroups;
  renderAgents: (
    agents: AgentCard[],
    onReorder: (draggedId: string, targetId: string, placeAfter: boolean) => void,
  ) => React.ReactNode;
  ancestors: WorktreeLink[];
  childLinks: WorktreeLink[];
  /** Open terminals of every session in this worktree, orchestrated workers included. */
  terminalHandles: string[];
  onAction: (action: ActionRequest) => Promise<void>;
  /** While a worktree is being dragged, every panel collapses to its heading row. */
  reordering: boolean;
  /** Whether this worktree is in the project view's worktree focus. */
  focused: boolean;
  onToggleFocus: () => void;
}

export interface WorktreeLink {
  worktreeId: string;
  name: string;
  needsMe: number;
  working: number;
}

interface WorktreeAction {
  key: keyof typeof ACTION_ICONS;
  label: string;
  description: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
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
  renderAgents,
  ancestors,
  childLinks,
  terminalHandles,
  onAction,
  reordering,
  focused,
  onToggleFocus,
}: WorktreePanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Shown until the next poll brings the new display name back from Orca.
  const [savedName, setSavedName] = useState<{ value: string; replaces: string } | null>(null);
  const shownName = savedName && savedName.replaces === worktree.name ? savedName.value : worktree.name;
  const [menu, setMenu] = useState<{ at: MenuPoint; confirmingCloseAll: boolean } | null>(null);
  const closeMenu = () => setMenu(null);
  const openMenu = (at: MenuPoint) => setMenu({ at, confirmingCloseAll: false });
  const pr = worktree.pullRequest;
  const [filter, setFilter] = useState<PanelFilter | null>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: worktree.worktreeId, animateLayoutChanges: () => false });
  const sectionRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    section.style.transform = DndCSS.Translate.toString(transform) ?? "";
    section.style.transition = transition ?? "";
  }, [transform, transition]);
  const wizard = useWorktreeWizard(wizardOrigin(worktree, true));
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
  const terminalHandle =
    all.find((agent) => agent.terminalHandle)?.terminalHandle ?? null;
  const toTerminal = () =>
    onAction(
      terminalHandle
        ? { type: "focus-terminal", terminalHandle }
        : { type: "open-terminal", worktreePath: worktree.path },
    );
  const actions: WorktreeAction[] = [
    {
      key: "session",
      label: "새 세션",
      description: "이 워크트리에 빈 에이전트 세션을 띄워요",
      run: () => void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" }),
    },
    {
      key: "terminal",
      label: "터미널로",
      description: terminalHandle ? "에이전트가 돌고 있는 Orca 터미널로 가요" : "이 워크트리에 Orca 터미널을 새로 열어요",
      run: () => void toTerminal(),
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
      description: "Orca에 보이는 이름만 바꿔요. 폴더와 브랜치는 그대로예요",
      run: () => setEditingName(true),
    },
    {
      key: "focus",
      label: focused ? "포커스 해제" : "이 워크트리만 보기",
      description: focused ? "프로젝트의 다른 워크트리도 다시 보여요" : "이 프로젝트에서 이 워크트리만 남기고 가려요",
      run: onToggleFocus,
    },
    ...(worktree.isMain
      ? []
      : [
          {
            key: "remove" as const,
            label: "워크트리 삭제",
            description: "Orca에서 이 워크트리를 지워요. 브랜치는 남아요",
            danger: true,
            run: () => setRemoving(true),
          },
        ]),
  ];
  const open = (target: string) =>
    onAction({
      type: "open-artifact",
      target,
      via: "system",
      worktreePath: worktree.path,
    });

  return (
    <section
      ref={(element: HTMLElement | null) => {
        sectionRef.current = element;
        setNodeRef(element);
      }}
      data-jump={worktree.worktreeId}
      className={`grid scroll-mt-6 grid-cols-1 gap-x-6 border-t border-hair ${
        reordering ? "gap-y-2 py-2" : "gap-y-4 pt-6 pb-10 lg:grid-cols-[176px_minmax(0,1fr)]"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div
        onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => {
          if (event.target instanceof HTMLElement && event.target.closest("a, input, textarea")) return;
          event.preventDefault();
          openMenu({ x: event.clientX, y: event.clientY });
        }}
        className={`relative ${menu ? "z-20" : "z-10"} min-w-0 ${
          reordering
            ? "[&>*:not([data-reorder-keep])]:hidden"
            : "lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto"
        }`}
      >
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
        {editingName ? (
          <div className={indentOf(ancestors.length)}>
            <WorktreeNameForm
              worktree={worktree}
              onDone={(saved) => {
                setEditingName(false);
                if (saved) setSavedName({ value: saved, replaces: worktree.name });
              }}
            />
          </div>
        ) : (
          <div data-reorder-keep className={`flex items-start gap-1 ${indentOf(ancestors.length)}`}>
            <h3
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-roledescription="끌어서 순서 바꾸기"
              title="끌어서 워크트리 순서를 바꿔요"
              className="group -mx-1.5 flex min-w-0 flex-1 cursor-grab touch-none items-start gap-1 rounded-md px-1.5 py-0.5 text-[17px] leading-[1.35] font-bold tracking-[-0.01em] break-all hover:bg-tint active:cursor-grabbing"
            >
              <span className="mt-[0.1em] shrink-0 text-faint group-hover:text-muted">{ACTION_ICONS.drag}</span>
              <span className="min-w-0 flex-1">
                {ancestors.length > 0 && <Elbow />}
                {shownName}
              </span>
            </h3>
            <button
              type="button"
              aria-label={`${worktree.name} 워크트리 메뉴`}
              aria-expanded={menu !== null}
              title="워크트리 메뉴 · 우클릭으로도 열려요"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
              className="mt-px shrink-0 cursor-pointer rounded-md p-1 text-muted hover:bg-tint-2 hover:text-fg"
            >
              {ACTION_ICONS.menu}
            </button>
          </div>
        )}
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
        <JiraLine jira={worktree.jira} featureRow={featureRow} onOpen={(url) => void open(url)} />
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

      <div className={`flex min-w-0 flex-col gap-6 ${reordering ? "hidden" : ""}`}>
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

        <div className="empty:hidden">
          {listed.length > 0 && renderAgents(listed, sessions.move)}
          <PendingLaunchRows worktreePath={worktree.path} standalone={listed.length === 0} />
        </div>
      </div>
    </section>
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
    <p className="mt-2 text-[12px]">
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
      {todo && <span className="block text-ask">사람이 옮길 것 · {todo}</span>}
    </p>
  );
}
