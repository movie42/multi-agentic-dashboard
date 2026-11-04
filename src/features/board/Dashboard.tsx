"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionRequest } from "@/lib/orca/actions";
import type {
  AgentCard,
  ProjectSummary,
  WorktreeSummary,
} from "@/lib/orca/types";
import { buildSteps } from "@/lib/workflow/steps";
import type { FeatureSummary, WorkflowMode } from "@/lib/workflow/types";
import { postAction } from "./actions";
import { AgentCardView, type CardProgress } from "./AgentCardView";
import { foldWorkers, groupAgents, type FoldedAgents } from "./classify";
import { CommandPalette } from "./CommandPalette";
import { FeatureGroup } from "./FeatureGroup";
import { FocusChips, FocusToggle } from "./FocusControls";
import { LaunchAgent } from "./LaunchAgent";
import { ProjectSidebar, type ProjectCounts } from "./ProjectSidebar";
import { AgentList } from "./AgentList";
import { RuntimeSwitch } from "./RuntimeSwitch";
import { SessionsPage } from "./SessionsPage";
import { StageBoard } from "./StageBoard";
import { useAttention } from "./useAttention";
import { useKeyboardNav } from "./useKeyboardNav";
import { useStoredList } from "./useStoredList";
import { useBoard } from "./useBoard";
import { useDismissed } from "./useDismissed";
import { useWorkspacePrefs } from "./useWorkspacePrefs";
import { WorktreePanel, type WorktreeLink } from "./WorktreePanel";

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

export function Dashboard() {
  const { board, error } = useBoard();
  const prefs = useWorkspacePrefs();
  const dismissed = useDismissed();
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewKeys, writeView] = useStoredList("agent-control:overview-view");
  const view: OverviewView = viewKeys[0] === "stage" ? "stage" : "turn";
  const [focusKeys, writeFocus] = useStoredList("agent-control:overview-focus");
  const [jump, setJump] = useState<JumpTarget | null>(null);
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
    setNotice(null);
    try {
      await postAction(action);
    } catch (actionError) {
      setNotice(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    }
  };

  const folded = foldWorkers(board?.agents ?? []);
  const needsMeCount = groupAgents(folded.top, dismissed.isDismissed).needsMe
    .length;
  useAttention(board?.agents ?? null, needsMeCount, folded.foldedIds);
  useKeyboardNav();

  if (!board) {
    return (
      <main className="flex flex-col items-start gap-4 px-12 py-14 text-[14px] text-muted">
        <p>
          {error
            ? `Orca에 연결하지 못했습니다: ${error}`
            : "Orca에서 에이전트 상태를 불러오는 중…"}
        </p>
        {error && <RuntimeSwitch />}
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
  const jumpToAgent = (agent: AgentCard) =>
    jumpTo(agent.repo, [agent.id, agent.worktreeId]);
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
  const focusedWorktrees = board.worktrees.filter((worktree) =>
    inFocus(worktree.repo),
  );
  const focusGroups = groupAgents(
    foldWorkers(focusedAgents).top,
    dismissed.isDismissed,
  );

  const needle = query.trim().toLowerCase();
  const worktreeMatches = (worktree: WorktreeSummary) =>
    [
      worktree.repo,
      worktree.name,
      worktree.branch,
      ...worktree.flowTasks.map((task) => `${task.taskId} ${task.title}`),
    ].some((value) => value?.toLowerCase().includes(needle));
  const agentMatches = (agent: AgentCard) => {
    if (!needle) return true;
    const worktree = worktreeById.get(agent.worktreeId);
    return (
      (worktree ? worktreeMatches(worktree) : false) ||
      [
        agent.repo,
        agent.worktreeName,
        agent.branch,
        agent.prompt,
        agent.lastMessage,
      ].some((value) => value?.toLowerCase().includes(needle))
    );
  };
  const visibleAgents = focusedAgents.filter(agentMatches);
  const visibleWorktrees = needle
    ? focusedWorktrees.filter(
        (worktree) =>
          worktreeMatches(worktree) ||
          visibleAgents.some(
            (agent) => agent.worktreeId === worktree.worktreeId,
          ),
      )
    : focusedWorktrees;
  const visibleFold = foldWorkers(visibleAgents);
  const visibleGroups = groupAgents(visibleFold.top, dismissed.isDismissed);

  const allGroups = groupAgents(folded.top, dismissed.isDismissed);
  const countsByRepo = new Map<string, ProjectCounts>();
  const bump = (repo: string, key: keyof ProjectCounts) => {
    const counts = countsByRepo.get(repo) ?? {
      needsMe: 0,
      working: 0,
      worktrees: 0,
    };
    countsByRepo.set(repo, { ...counts, [key]: counts[key] + 1 });
  };
  allGroups.needsMe.forEach((agent) => bump(agent.repo, "needsMe"));
  allGroups.working.forEach((agent) => bump(agent.repo, "working"));
  board.worktrees.forEach((worktree) => bump(worktree.repo, "worktrees"));

  const selectedRepo =
    prefs.selectedRepo && projectByRepo.has(prefs.selectedRepo)
      ? prefs.selectedRepo
      : null;

  return (
    <div className="md:pl-72">
      <CommandPalette
        board={board}
        onSelectRepo={prefs.selectRepo}
        onOpenSessions={prefs.openSessions}
      />
      <ProjectSidebar
        projects={board.projects}
        countsByRepo={countsByRepo}
        totalNeedsMe={focusGroups.needsMe.length}
        totalWorking={focusGroups.working.length}
        focused={focused}
        onToggleFocus={toggleFocus}
        prefs={prefs}
        fetchedAt={board.fetchedAt}
        error={error}
      />

      <main className="mx-auto flex max-w-[1920px] min-w-0 flex-col gap-16 px-5 pt-14 pb-36 md:px-12">
        {notice && (
          <p className="rounded-lg bg-tint px-4 py-3 text-[14px]">
            <span className="mr-2 font-semibold text-accent">실행 실패</span>
            {notice}
          </p>
        )}

        {prefs.showingSessions ? (
          <SessionsPage onAction={runAction} />
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
                  className="w-full max-w-md rounded-full bg-tint px-4 py-1.5 text-[14px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
                />
                {needle && (
                  <span className="text-[12px] text-muted">
                    에이전트 {visibleAgents.length} · worktree{" "}
                    {visibleWorktrees.length}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <LaunchAgent worktrees={focusedWorktrees} showRepo />
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
  onAction: (action: ActionRequest) => void;
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
  const allPanels = worktrees.map((worktree) => ({
    worktree,
    groups: groupAgents(
      agents.top.filter((agent) => agent.worktreeId === worktree.worktreeId),
      isDismissed,
    ),
  }));
  allPanels.sort(
    (a, b) =>
      b.groups.needsMe.length - a.groups.needsMe.length ||
      b.groups.working.length - a.groups.working.length ||
      (b.worktree.lastActivityAt ?? 0) - (a.worktree.lastActivityAt ?? 0),
  );
  const ids = new Set(worktrees.map((worktree) => worktree.worktreeId));
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
        <div className="mt-6">
          <LaunchAgent key={repo} worktrees={worktrees} showRepo={false} />
        </div>
      </header>
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
              now={now}
              renderCard={renderCard}
              workersOf={agents.workersOf}
              ancestors={ancestors}
              childLinks={children.map(linkOf)}
              expandedId={expandedId}
              onAction={onAction}
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
