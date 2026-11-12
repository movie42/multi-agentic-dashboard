"use client";

import { useEffect, useRef, useState } from "react";
import { DiffTab } from "@/client/widgets/intent-diff";
import type { ActionRequest } from "@/common/actions/schema";
import type {
  AgentCard,
  BoardSnapshot,
  ProjectSummary,
  WorktreeSummary,
} from "@/common/orca/types";
import { buildSteps } from "@/common/workflow/steps";
import type { FeatureSummary, WorkflowMode } from "@/common/workflow/types";
import { postAction } from "@/client/shared/api/actions";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { toastError } from "@/client/shared/model/toastStore";
import { AgentCardView, type CardProgress } from "@/client/widgets/agent-card";
import { foldWorkers, groupAgents, needsInput, type FoldedAgents } from "@/client/entities/agent";
import { InputAlerts } from "@/client/widgets/input-alerts";
import { CommandPalette } from "@/client/widgets/command-palette";
import { FeatureGroup } from "@/client/widgets/feature-group";
import { FocusChips, FocusToggle } from "@/client/features/focus-projects";
import { LaunchAgent } from "@/client/features/launch-agent";
import { ProjectSidebar, type ProjectCounts } from "@/client/widgets/project-sidebar";
import { AgentList } from "@/client/widgets/agent-list";
import { RuntimeSwitch } from "@/client/features/switch-runtime";
import { SessionsPage } from "@/client/widgets/session-list";
import { StageBoard } from "@/client/widgets/stage-board";
import { TodoBoardPage } from "@/client/widgets/todo-board";
import { useAttention } from "../model/useAttention";
import { useKeyboardNav } from "@/client/shared/lib/useKeyboardNav";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { useBoard } from "../model/useBoard";
import { useSidebarCollapsed } from "../model/useSidebarCollapsed";
import { useDismissed } from "@/client/entities/agent";
import { useWorkspacePrefs } from "@/client/entities/workspace";
import { WorktreePanel, type WorktreeLink } from "@/client/widgets/worktree-panel";
import { ProjectWorktreeWizard } from "@/client/features/create-worktree";
import { isViewableDoc, useDocViewerStore } from "@/client/features/view-doc";
import { DocPanel } from "@/client/widgets/doc-panel";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle";
import { paneWidth } from "@/client/shared/lib/paneWidth";

interface SectionProps {
  title: string;
  count: number;
  hint: string;
  status: "ask" | "now" | "wait";
  strong?: boolean;
  children: React.ReactNode;
}

const SECTION_DOT = {
  ask: "bg-ask",
  now: "bg-now",
  wait: "shadow-[inset_0_0_0_1.5px_var(--faint)]",
} as const;

function Section({
  title,
  count,
  hint,
  status,
  strong = false,
  children,
}: SectionProps) {
  return (
    <section
      className={`grid grid-cols-1 gap-x-6 gap-y-4 pt-4 lg:grid-cols-[176px_minmax(0,1fr)] ${
        strong ? "border-t-2 border-fg" : "border-t border-hair"
      }`}
    >
      <div>
        <h2 className="flex items-center gap-2 text-[14px] leading-[1.7] font-bold">
          <span className={`size-2 rounded-full ${SECTION_DOT[status]}`} />
          {title}
          <span className="font-semibold text-muted">{count}</span>
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type OverviewView = "turn" | "stage";

const VIEW_OPTIONS: { key: OverviewView; label: string }[] = [
  { key: "turn", label: "차례별" },
  { key: "stage", label: "단계별" },
];

interface JumpTarget {
  repo: string;
  targets: string[];
}

const FALLBACK_PROJECT: ProjectSummary = { repo: "", autoMode: "company" };

const SEARCH_INPUT_CLASS =
  "w-full max-w-md rounded-full bg-tint px-4 py-1.5 text-[14px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]";

function worktreeMatches(worktree: WorktreeSummary, needle: string) {
  return [
    worktree.repo,
    worktree.name,
    worktree.branch,
    ...worktree.flowTasks.map((task) => `${task.taskId} ${task.title}`),
  ].some((value) => value?.toLowerCase().includes(needle));
}

function agentMatches(
  agent: AgentCard,
  worktree: WorktreeSummary | undefined,
  needle: string,
) {
  if (!needle) return true;
  return (
    (worktree ? worktreeMatches(worktree, needle) : false) ||
    [
      agent.repo,
      agent.worktreeName,
      agent.branch,
      agent.prompt,
      agent.lastMessage,
    ].some((value) => value?.toLowerCase().includes(needle))
  );
}

const worktreeOrderKey = (repo: string) =>
  `agent-control:worktree-order:${repo}`;

export function DashboardLoading() {
  return (
    <main className="flex flex-col items-start gap-4 px-12 py-14 text-[14px] text-muted">
      <p>Orca에서 에이전트 상태를 불러오는 중…</p>
    </main>
  );
}

interface DashboardProps {
  initialBoard?: BoardSnapshot | null;
}

export function Dashboard({ initialBoard = null }: DashboardProps) {
  const boardQuery = useBoard(initialBoard);
  const board = boardQuery.data ?? null;
  const error = boardQuery.error ? errorMessage(boardQuery.error) : null;
  const prefs = useWorkspacePrefs();
  const dismissed = useDismissed();
  const openDoc = useDocViewerStore((state) => state.open);
  const docOpen = useDocViewerStore((state) => state.tabs.length > 0);
  const [query, setQuery] = useState("");
  const [viewKeys, writeView] = useStoredList("agent-control:overview-view");
  const view: OverviewView = viewKeys[0] === "stage" ? "stage" : "turn";
  const [focusKeys, writeFocus] = useStoredList("agent-control:overview-focus");
  const [jump, setJump] = useState<JumpTarget | null>(null);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();
  const handledJump = useRef<JumpTarget | null>(null);

  const jumpTo = (repo: string, targets: string[]) => {
    setJump({ repo, targets });
    prefs.selectRepo(repo);
  };

  useEffect(() => {
    if (
      !jump ||
      handledJump.current === jump ||
      prefs.selectedRepo !== jump.repo
    )
      return;
    handledJump.current = jump;
    const element = jump.targets
      .map((target) =>
        document.querySelector<HTMLElement>(
          `[data-jump="${CSS.escape(target)}"]`,
        ),
      )
      .find((found) => found !== null);
    element?.scrollIntoView({ block: "start" });
    element
      ?.querySelector<HTMLElement>("[data-card]")
      ?.focus({ preventScroll: true });
  }, [jump, prefs.selectedRepo]);

  const runAction = async (action: ActionRequest) => {
    if (action.type === "open-artifact" && action.via === "system" && isViewableDoc(action.target)) {
      openDoc(action.target);
      return;
    }
    try {
      await postAction(action);
    } catch (actionError) {
      toastError("action", actionError, { type: action.type });
    }
  };

  const folded = foldWorkers(board?.agents ?? []);
  const needsMeCount = groupAgents(folded.top, dismissed.isDismissed).needsMe
    .length;
  const jumpToAgent = (agent: AgentCard) =>
    jumpTo(agent.repo, [agent.id, agent.worktreeId]);
  useAttention(board?.agents ?? null, needsMeCount, folded.foldedIds, jumpToAgent);
  useKeyboardNav();

  if (!board) {
    if (!error) return <DashboardLoading />;
    return (
      <main className="flex flex-col items-start gap-4 px-12 py-14 text-[14px] text-muted">
        <p>{`Orca에 연결하지 못했습니다: ${error}`}</p>
        <RuntimeSwitch />
      </main>
    );
  }

  const now = board.fetchedAt;
  const projectByRepo = new Map(
    board.projects.map((project) => [project.repo, project]),
  );
  const worktreeById = new Map(
    board.worktrees.map((worktree) => [worktree.worktreeId, worktree]),
  );
  const modeOfRepo = (repo: string) =>
    prefs.modeOf(projectByRepo.get(repo) ?? { ...FALLBACK_PROJECT, repo });

  const progressOf = (
    worktree: WorktreeSummary | undefined,
  ): CardProgress | null => {
    const task = worktree?.flowTasks[0];
    if (!worktree || !task) return null;
    return {
      taskId: task.taskId,
      title: task.title,
      steps: buildSteps(modeOfRepo(worktree.repo), task, worktree.pullRequest),
    };
  };

  const renderCard = (agent: AgentCard, withProgress: boolean) => (
    <AgentCardView
      key={agent.id}
      agent={agent}
      now={now}
      progress={
        withProgress ? progressOf(worktreeById.get(agent.worktreeId)) : null
      }
      worktreePr={worktreeById.get(agent.worktreeId)?.pullRequest ?? null}
      dismissed={dismissed.isDismissed(agent)}
      onToggleDismiss={() =>
        dismissed.isDismissed(agent)
          ? dismissed.restore(agent)
          : dismissed.dismiss(agent)
      }
      onAction={runAction}
    />
  );

  const withProgressCard = (agent: AgentCard) => renderCard(agent, true);
  const withoutProgressCard = (agent: AgentCard) => renderCard(agent, false);

  const focused = new Set(focusKeys.filter((repo) => projectByRepo.has(repo)));
  const toggleFocus = (repo: string) =>
    writeFocus(
      focused.has(repo)
        ? [...focused].filter((item) => item !== repo)
        : [...focused, repo],
    );
  const inFocus = (repo: string) => focused.size === 0 || focused.has(repo);
  const focusedAgents = board.agents.filter((agent) => inFocus(agent.repo));
  const focusedWorktrees = board.worktrees
    .filter((worktree) => inFocus(worktree.repo))
    .sort(
      (a, b) =>
        a.repo.localeCompare(b.repo) ||
        a.name.localeCompare(b.name) ||
        a.worktreeId.localeCompare(b.worktreeId),
    );
  const focusGroups = groupAgents(
    foldWorkers(focusedAgents).top,
    dismissed.isDismissed,
  );

  const needle = query.trim().toLowerCase();
  const visibleAgents = focusedAgents.filter((agent) =>
    agentMatches(agent, worktreeById.get(agent.worktreeId), needle),
  );
  const visibleWorktrees = needle
    ? focusedWorktrees.filter(
        (worktree) =>
          worktreeMatches(worktree, needle) ||
          visibleAgents.some(
            (agent) => agent.worktreeId === worktree.worktreeId,
          ),
      )
    : focusedWorktrees;
  const visibleFold = foldWorkers(visibleAgents);
  const visibleGroups = groupAgents(visibleFold.top, dismissed.isDismissed);

  const allGroups = groupAgents(folded.top, dismissed.isDismissed);
  const inputAgents = folded.top.filter(needsInput);
  const countsByRepo = new Map<string, ProjectCounts>();
  const bump = (repo: string, key: keyof ProjectCounts) => {
    const counts = countsByRepo.get(repo) ?? {
      needsInput: 0,
      needsMe: 0,
      working: 0,
      worktrees: 0,
    };
    countsByRepo.set(repo, { ...counts, [key]: counts[key] + 1 });
  };
  inputAgents.forEach((agent) => bump(agent.repo, "needsInput"));
  allGroups.needsMe.forEach((agent) => bump(agent.repo, "needsMe"));
  allGroups.working.forEach((agent) => bump(agent.repo, "working"));
  board.worktrees.forEach((worktree) => bump(worktree.repo, "worktrees"));

  const selectedRepo =
    prefs.selectedRepo && projectByRepo.has(prefs.selectedRepo)
      ? prefs.selectedRepo
      : null;

  return (
    <div className={`${sidebarCollapsed ? "" : "md:pl-[var(--sidebar-w,18rem)]"} ${docOpen ? "md:pr-[var(--doc-panel-w,50vw)]" : ""}`}>
      <ResizeHandle
        cssVar="--sidebar-w"
        storageKey="agent-control:sidebar-width"
        edge="right"
        defaultWidth={() => 288}
        min={200}
        max={() => Math.min(520, window.innerWidth - (docOpen ? paneWidth("--doc-panel-w", 0) : 0) - 400)}
        label="사이드바 크기 조절"
        className={`fixed inset-y-0 left-[calc(var(--sidebar-w,18rem)-4px)] hidden ${sidebarCollapsed ? "" : "md:flex"}`}
      />
      {sidebarCollapsed ? (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="사이드바 펼치기"
          title="사이드바 펼치기 (⌘B)"
          className="fixed top-3 left-3 z-40 hidden h-8 w-8 items-center justify-center rounded-md text-[16px] text-muted hover:bg-tint hover:text-current md:flex"
        >
          »
        </button>
      ) : null}
      <DocPanel agents={board.agents} />
      <InputAlerts agents={inputAgents} now={now} docOpen={docOpen} onOpen={jumpToAgent} />
      <CommandPalette
        board={board}
        onSelectRepo={prefs.selectRepo}
        onOpenSessions={prefs.openSessions}
      />
      <ProjectSidebar
        projects={board.projects}
        countsByRepo={countsByRepo}
        totalNeedsInput={inputAgents.filter((agent) => inFocus(agent.repo)).length}
        totalNeedsMe={focusGroups.needsMe.length}
        totalWorking={focusGroups.working.length}
        focused={focused}
        onToggleFocus={toggleFocus}
        prefs={prefs}
        fetchedAt={board.fetchedAt}
        error={error}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />

      <main className="mx-auto flex max-w-[1920px] min-w-0 flex-col gap-16 px-5 pt-14 pb-36 md:px-12">
        {prefs.showingSessions ? (
          <SessionsPage onAction={runAction} />
        ) : prefs.showingTodo ? (
          <TodoBoardPage
            repos={board.projects.map((project) => project.repo)}
            agents={board.agents}
            worktrees={board.worktrees}
            now={board.fetchedAt}
            onAction={runAction}
            onJumpToAgent={jumpToAgent}
          />
        ) : prefs.showingDiff ? (
          <DiffTab worktrees={board.worktrees} />
        ) : selectedRepo === null ? (
          <>
            <header>
              <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">
                전체
              </h1>
              <p className="mt-2.5 text-[13px] text-muted">
                내 차례 {focusGroups.needsMe.length} · 에이전트 작업 중{" "}
                {focusGroups.working.length} · 쉬는 중{" "}
                {focusGroups.resting.length} · 프로젝트{" "}
                {focused.size > 0
                  ? `${focused.size}/${board.projects.length}`
                  : board.projects.length}
              </p>
              <FocusChips
                repos={board.projects
                  .map((project) => project.repo)
                  .filter((repo) => focused.has(repo))}
                onRemove={toggleFocus}
                onClear={() => writeFocus([])}
              />

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="flex rounded-full bg-tint p-0.5 text-[13px] font-semibold">
                  {VIEW_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={view === option.key}
                      onClick={() => writeView([option.key])}
                      className={`rounded-full px-3.5 py-1.5 leading-none ${
                        view === option.key
                          ? "bg-fg text-bg"
                          : "text-muted hover:text-fg"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  value={query}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setQuery(event.target.value)
                  }
                  placeholder="이 화면 거르기 · 프로젝트, 브랜치, 작업, 요청, 답변"
                  className={SEARCH_INPUT_CLASS}
                />
                {needle && (
                  <span className="text-[12px] text-muted">
                    에이전트 {visibleAgents.length} · worktree{" "}
                    {visibleWorktrees.length}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <LaunchAgent worktrees={focusedWorktrees} showRepo draftKey="all" />
              </div>
            </header>

            {view === "stage" ? (
              <StageBoard
                worktrees={visibleWorktrees}
                agents={visibleAgents}
                modeOfRepo={modeOfRepo}
                isDismissed={dismissed.isDismissed}
                onJump={(repo, worktreeId) => jumpTo(repo, [worktreeId])}
              />
            ) : (
              <>
                <Section
                  title="내 차례"
                  count={visibleGroups.needsMe.length}
                  status="ask"
                  strong
                  hint="에이전트가 답을 끝내고 나를 기다리는 것들. 막힘·내 입력 대기 → 중단됨 → 새 결과 → 나머지, 같은 순위는 오래 기다린 순"
                >
                  {visibleGroups.needsMe.length === 0 ? (
                    <p className="text-[15px] text-muted">
                      지금 확인할 에이전트가 없어요.
                    </p>
                  ) : (
                    <AgentList
                      agents={visibleGroups.needsMe}
                      now={now}
                      showRepo
                      renderCard={withProgressCard}
                      onJump={jumpToAgent}
                      workersOf={visibleFold.workersOf}
                    />
                  )}
                </Section>

                {visibleGroups.working.length > 0 && (
                  <Section
                    title="에이전트 작업 중"
                    count={visibleGroups.working.length}
                    status="now"
                    hint="에이전트가 아직 답을 쓰는 중. 오래 돈 순. 줄을 누르면 펼쳐져요"
                  >
                    <AgentList
                      agents={visibleGroups.working}
                      now={now}
                      showRepo
                      renderCard={withProgressCard}
                      onJump={jumpToAgent}
                      workersOf={visibleFold.workersOf}
                    />
                  </Section>
                )}

                {visibleGroups.resting.length > 0 && (
                  <Section
                    title="쉬는 중"
                    count={visibleGroups.resting.length}
                    status="wait"
                    hint="정리한 것과 쉬는 세션. 줄을 누르면 펼쳐져요"
                  >
                    <AgentList
                      agents={visibleGroups.resting}
                      now={now}
                      showRepo
                      renderCard={withProgressCard}
                      onJump={jumpToAgent}
                      workersOf={visibleFold.workersOf}
                    />
                  </Section>
                )}
              </>
            )}
          </>
        ) : (
          <ProjectView
            key={selectedRepo}
            repo={selectedRepo}
            worktrees={board.worktrees.filter(
              (worktree) => worktree.repo === selectedRepo,
            )}
            features={board.features}
            agents={foldWorkers(
              board.agents.filter((agent) => agent.repo === selectedRepo),
            )}
            mode={modeOfRepo(selectedRepo)}
            now={now}
            isDismissed={dismissed.isDismissed}
            renderCard={withoutProgressCard}
            expandedId={jump?.targets[0] ?? null}
            onAction={runAction}
            focused={focused.has(selectedRepo)}
            onToggleFocus={() => toggleFocus(selectedRepo)}
          />
        )}
      </main>
    </div>
  );
}

function rowOf(feature: FeatureSummary, worktree: WorktreeSummary) {
  return (
    feature.rows.find((row) => row.worktree === worktree.path) ??
    feature.rows.find(
      (row) => worktree.branch !== null && row.branch === worktree.branch,
    ) ??
    null
  );
}

interface ProjectViewProps {
  repo: string;
  worktrees: WorktreeSummary[];
  features: FeatureSummary[];
  agents: FoldedAgents;
  mode: WorkflowMode;
  now: number;
  isDismissed: (agent: AgentCard) => boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
  expandedId: string | null;
  onAction: (action: ActionRequest) => Promise<void>;
  focused: boolean;
  onToggleFocus: () => void;
}

function ProjectView({
  repo,
  worktrees,
  features,
  agents,
  mode,
  now,
  isDismissed,
  renderCard,
  expandedId,
  onAction,
  focused,
  onToggleFocus,
}: ProjectViewProps) {
  const [query, setQuery] = useState("");
  const [storedOrder, writeOrder] = useStoredList(worktreeOrderKey(repo));
  const needle = query.trim().toLowerCase();

  const rank = new Map(storedOrder.map((id, index) => [id, index]));
  // The server passes Orca's order, which reshuffles on every agent event.
  const ordered = [...worktrees].sort(
    (a, b) =>
      (rank.get(a.worktreeId) ?? storedOrder.length) -
        (rank.get(b.worktreeId) ?? storedOrder.length) ||
      a.name.localeCompare(b.name) ||
      a.worktreeId.localeCompare(b.worktreeId),
  );
  const moveWorktree = (
    draggedId: string,
    targetId: string,
    placeAfter: boolean,
  ) => {
    const rest = ordered
      .map((worktree) => worktree.worktreeId)
      .filter((id) => id !== draggedId);
    const at = rest.indexOf(targetId);
    if (at === -1) return;
    writeOrder([
      ...rest.slice(0, at + Number(placeAfter)),
      draggedId,
      ...rest.slice(at + Number(placeAfter)),
    ]);
  };

  const worktreeById = new Map(
    worktrees.map((worktree) => [worktree.worktreeId, worktree]),
  );
  const visibleTop = agents.top.filter((agent) =>
    agentMatches(agent, worktreeById.get(agent.worktreeId), needle),
  );
  const visibleWorktrees = needle
    ? ordered.filter(
        (worktree) =>
          worktreeMatches(worktree, needle) ||
          visibleTop.some((agent) => agent.worktreeId === worktree.worktreeId),
      )
    : ordered;

  const allPanels = visibleWorktrees.map((worktree) => ({
    worktree,
    groups: groupAgents(
      visibleTop.filter((agent) => agent.worktreeId === worktree.worktreeId),
      isDismissed,
    ),
  }));
  const ids = new Set(visibleWorktrees.map((worktree) => worktree.worktreeId));
  const isChild = (worktree: WorktreeSummary) =>
    worktree.parentWorktreeId !== null && ids.has(worktree.parentWorktreeId);
  const panels = allPanels.filter((panel) => !isChild(panel.worktree));
  const childrenOf = (worktree: WorktreeSummary) =>
    allPanels.filter(
      (panel) => panel.worktree.parentWorktreeId === worktree.worktreeId,
    );
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  const sections: { feature: FeatureSummary | null; panels: typeof panels }[] =
    [];
  for (const panel of panels) {
    const feature = panel.worktree.featureId
      ? (featureById.get(panel.worktree.featureId) ?? null)
      : null;
    const section = sections.find((entry) => entry.feature === feature);
    if (section) section.panels.push(panel);
    else sections.push({ feature, panels: [panel] });
  }
  sections.sort(
    (a, b) => Number(a.feature === null) - Number(b.feature === null),
  );
  const hasFeatures = sections.some((section) => section.feature !== null);

  return (
    <>
      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">
            {repo}
          </h1>
          <FocusToggle active={focused} onToggle={onToggleFocus} />
        </div>
        <p className="mt-2.5 text-[13px] text-muted">
          worktree {worktrees.length}개 ·{" "}
          {mode === "company" ? "회사 워크플로" : "개인 워크플로"}
        </p>
        {worktrees[0] && <ProjectWorktreeWizard key={repo} anchor={worktrees[0]} />}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(event.target.value)
            }
            placeholder="이 화면 거르기 · 워크트리, 브랜치, 작업, 요청, 답변"
            className={SEARCH_INPUT_CLASS}
          />
          {needle && (
            <span className="text-[12px] text-muted">
              에이전트 {visibleTop.length} · worktree {visibleWorktrees.length}
            </span>
          )}
        </div>
        <div className="mt-4">
          <LaunchAgent key={repo} worktrees={worktrees} showRepo={false} draftKey={repo} />
        </div>
      </header>
      {needle && visibleWorktrees.length === 0 && (
        <p className="text-[15px] text-muted">거른 결과가 없어요.</p>
      )}
      {sections.map(({ feature, panels: sectionPanels }) => {
        const linkOf = ({
          worktree,
          groups,
        }: (typeof panels)[number]): WorktreeLink => ({
          worktreeId: worktree.worktreeId,
          name: worktree.name,
          needsMe: groups.needsMe.length,
          working: groups.working.length,
        });
        const renderPanel = (
          panel: (typeof panels)[number],
          ancestors: WorktreeLink[] = [],
        ): React.ReactNode[] => {
          const { worktree, groups } = panel;
          const children = childrenOf(worktree);
          return [
            <WorktreePanel
              key={worktree.worktreeId}
              worktree={worktree}
              featureRow={feature ? rowOf(feature, worktree) : null}
              mode={mode}
              groups={groups}
              renderAgents={(listed, onReorder) => (
                <AgentList
                  agents={listed}
                  onReorder={onReorder}
                  now={now}
                  showRepo={false}
                  renderCard={renderCard}
                  expandedId={expandedId}
                  workersOf={agents.workersOf}
                />
              )}
              ancestors={ancestors}
              childLinks={children.map(linkOf)}
              onAction={onAction}
              onDropWorktree={(draggedId, placeAfter) =>
                moveWorktree(draggedId, worktree.worktreeId, placeAfter)
              }
            />,
            ...children.flatMap((child) =>
              renderPanel(child, [...ancestors, linkOf(panel)]),
            ),
          ];
        };
        const rendered = sectionPanels.flatMap((panel) => renderPanel(panel));
        if (feature) {
          return (
            <FeatureGroup
              key={feature.id}
              feature={feature}
              onAction={onAction}
            >
              {rendered}
            </FeatureGroup>
          );
        }
        return (
          <section
            key="no-feature"
            className={hasFeatures ? "border-t-2 border-fg pt-6" : undefined}
          >
            {hasFeatures && (
              <h2 className="text-[22px] leading-[1.3] font-bold tracking-[-0.015em]">
                기능 문서 없음
              </h2>
            )}
            <div className={hasFeatures ? "mt-2" : undefined}>{rendered}</div>
          </section>
        );
      })}
    </>
  );
}
