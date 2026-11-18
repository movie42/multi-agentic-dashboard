"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { LinkKind } from "@/common/orchestration/types";
import { buildSteps, roundDocOf } from "@/common/workflow/steps";
import type { WorkflowMode } from "@/common/workflow/types";
import { fileOverlapsQueryOptions } from "../api/fileOverlapsQuery";
import { groupNodes, groupOf, movePositions, pruneCanvas, renameGroup, resetPositions, resetSize, resizeBox, resolvePositions, setEdgeEnd, ungroup } from "../model/canvasState";
import { buildGraph, type GraphEdge } from "../model/graph";
import { autoLayout, type Point, type Side } from "../model/layout";
import { canvasKey, useCanvasState, type CanvasScope } from "../model/useCanvasState";
import { CanvasStage, type MenuTarget } from "./CanvasStage";
import { CanvasMenu } from "./CanvasMenu";
import { menuFor } from "./canvasMenuItems";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { useStoredListStore } from "@/client/shared/lib/storedListStore";
import { openInPanel, useDocViewerStore } from "@/client/features/view-doc";
import { useRunnerSessions } from "@/client/entities/runner";
import { displayStateOf, useRestOverrides } from "@/client/entities/agent";
import { blankTemplate, TemplateEditor } from "@/client/features/edit-template";
import type { TemplateRun, WorkflowTemplate } from "@/common/templates/types";
import { draftFromSelection } from "../model/templateDraft";
import { ConductorPopover, ConnectPicker, TemplatePopover } from "./CanvasOverlays";
import { GraphToolbar } from "./GraphToolbar";
import { Legend } from "./Legend";
import { nodeTitle } from "./NodeBox";
import { SidePanel, type PanelView } from "./SidePanel";


const PANEL_PREF = "agent-control:canvas-panel";
/** Session tabs stay per canvas, so each project keeps the sessions opened on it. */
const tabsPref = (key: string) => `agent-control:panel-tabs:${key}`;
const SELECTION_TAB = "selection";
const EMPTY_TAB = "empty";

export interface CanvasPanelTab {
  id: string;
  label: string;
  content: React.ReactNode;
  closable: boolean;
}

/** The right panel the host draws around the session view: its tabs before any document tabs. */
export interface CanvasPanel {
  tabs: CanvasPanelTab[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCollapse: () => void;
}

interface PendingConnect {
  from: string;
  to: string;
  at: Point;
}

interface ProjectCanvasProps {
  scope: CanvasScope;
  /** The worktrees shown, in sidebar order. */
  worktrees: WorktreeSummary[];
  /** Every session shown, orchestrated workers included. */
  agents: AgentCard[];
  /** Every session on the board, for conductors outside this project that work with sessions here. */
  everyAgent: AgentCard[];
  modeOf: (repo: string) => WorkflowMode;
  now: number;
  /** Project name, workflow and focus toggle, floated over the top-left corner. */
  header: React.ReactNode;
  renderCard: (agent: AgentCard) => React.ReactNode;
  onAction: (action: ActionRequest) => Promise<void>;
  onOpenWorktree: (worktreeId: string) => void;
  /** A port clicked: go to that worktree in its own project. */
  onOpenElsewhere: (repo: string, worktreeId: string) => void;
  /** A project frame's link on the all-projects canvas. */
  onOpenProject?: (repo: string) => void;
  renderPanel: (panel: CanvasPanel) => React.ReactNode;
}

function panelLabel(view: PanelView): string {
  switch (view.kind) {
    case "agent":
      return nodeTitle(view.agent);
    case "many":
      return `상자 ${view.count}개`;
    case "edge":
      return "연결";
    case "run":
      return view.run.name;
    case "all":
      return "연결 · 규칙";
    case "empty":
      return "세션";
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * The project overview as a canvas: conductors on top, every worktree as a frame of session boxes,
 * the lines between them, and the selected session answered in the side panel.
 */
export function ProjectCanvas({ scope, worktrees, agents, everyAgent, modeOf, now, header, renderCard, onAction, onOpenWorktree, onOpenElsewhere, onOpenProject, renderPanel }: ProjectCanvasProps) {
  // Worktree lines (fork, same files) come from git, not from anything a person connected, so they stay off until asked for.
  const [showWorktreeLines, setShowWorktreeLines] = useState(false);
  const overlapPaths = showWorktreeLines ? worktrees.filter((worktree) => !worktree.isMain).map((worktree) => worktree.path) : [];
  const overlaps = useQuery(fileOverlapsQueryOptions(overlapPaths)).data ?? [];
  const runner = useRunnerSessions();
  const runs = runner.state === "online" ? runner.runs : [];
  const built = buildGraph(agents, worktrees, overlaps, runs, everyAgent);
  const graph = showWorktreeLines ? built : { ...built, edges: built.edges.filter((edge) => edge.kind !== "fork" && edge.kind !== "overlap") };
  const [canvas, updateCanvas] = useCanvasState(canvasKey(scope));
  const auto = autoLayout(graph, { sizes: canvas.sizes, byProject: scope.kind === "all" });
  const positions = resolvePositions(auto.positions, canvas.positions);
  const anchors = resolvePositions(auto.anchors, canvas.positions);

  const rest = useRestOverrides();
  const [selected, setSelected] = useState<string[]>([]);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const [menu, setMenu] = useState<{ target: MenuTarget; at: Point } | null>(null);
  const [conductorFor, setConductorFor] = useState<{ clusterId: string; at: Point } | null>(null);
  const [templateFor, setTemplateFor] = useState<{ clusterId: string; at: Point } | null>(null);
  const [editing, setEditing] = useState<{ template: WorkflowTemplate; isNew: boolean; run?: TemplateRun } | null>(null);
  const [panelPref, writePanelPref] = useStoredList(PANEL_PREF);
  const panelCollapsed = panelPref.includes("collapsed");
  const [storedTabs, writeTabs] = useStoredList(tabsPref(canvasKey(scope)));
  /** The lead tab last brought forward: a session id, or the current selection. */
  const [focus, setFocus] = useState(SELECTION_TAB);
  const docTabCount = useDocViewerStore((state) => state.tabs.length);
  /** Picking something on the canvas brings its tab forward over any open document. */
  const showLead = () => useDocViewerStore.getState().activate(null);
  const openDoc = (target: string) => {
    if (!openInPanel(target)) void onAction({ type: "open-artifact", target });
  };

  const liveIds = new Set([...graph.nodes.keys(), ...graph.reserved.keys(), ...graph.clusters.map((cluster) => cluster.id)]);
  const save = (change: (current: typeof canvas) => typeof canvas) => updateCanvas((current) => pruneCanvas(change(current), liveIds));
  const liveSelected = selected.filter((id) => graph.nodes.has(id) || graph.reserved.has(id));
  const selectedSessions = liveSelected.filter((id) => graph.nodes.has(id));
  const selectedEdge = graph.edges.find((edge) => edge.id === edgeId) ?? null;
  const sessionTabs = storedTabs.filter((id) => graph.nodes.has(id));
  const openSessionTab = (id: string) => {
    if (!sessionTabs.includes(id)) writeTabs([...sessionTabs, id]);
    setFocus(id);
  };

  const select = (ids: string[], additive: boolean) => {
    setMenu(null);
    setEdgeId(null);
    setShowAllLinks(false);
    setPending(null);
    if (ids.length > 0) showLead();
    const next = !additive
      ? ids
      : ids.length === 1 && liveSelected.includes(ids[0]!)
        ? liveSelected.filter((id) => id !== ids[0])
        : [...new Set([...liveSelected, ...ids])];
    setSelected(next);
    const only = next.length === 1 ? next[0]! : null;
    if (only !== null && graph.nodes.has(only)) openSessionTab(only);
    else if (next.length > 0) setFocus(SELECTION_TAB);
  };

  const groupSelected = () => {
    if (liveSelected.length === 0) return;
    const id = crypto.randomUUID();
    save((current) => groupNodes(current, liveSelected, id, `그룹 ${current.groups.length + 1}`));
  };
  const ungroupSelected = () => {
    const group = liveSelected.map((id) => groupOf(canvas, id)).find((entry) => entry !== null);
    if (group) save((current) => ungroup(current, group.id));
  };
  const tidy = () => {
    save((current) => ({ ...resetPositions(current), viewport: null }));
    setStageKey((key) => key + 1);
  };

  // A document opened from anywhere (menu, quick open, a session card) unfolds the panel it lands in.
  useEffect(
    () =>
      useDocViewerStore.subscribe((state, previous) => {
        if (state.active === null || state.active === previous.active) return;
        const store = useStoredListStore.getState();
        if (store.lists[PANEL_PREF]?.includes("collapsed")) store.write(PANEL_PREF, []);
      }),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelected();
        else groupSelected();
      } else if (event.key === "Escape") {
        setSelected([]);
        setEdgeId(null);
        setPending(null);
        setMenu(null);
        setConductorFor(null);
        setTemplateFor(null);
        setConnecting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Same box: pin the end to the side it was dropped on. Another box: the line now runs there instead. */
  const moveEnd = async (edge: GraphEdge, end: "from" | "to", nodeId: string, side: Side) => {
    const linkId = edge.linkId;
    if (!linkId || edge.kind === "fork" || edge.kind === "overlap") return;
    if (nodeId === edge[end]) {
      save((current) => setEdgeEnd(current, linkId, end, side));
      return;
    }
    const from = end === "from" ? nodeId : edge.from;
    const to = end === "to" ? nodeId : edge.to;
    // A delegate prompt is not resent: moving the line should not hand the same work out twice.
    await onAction({ type: "connect-sessions", from, to, kind: edge.kind, prompt: edge.kind === "next" ? edge.prompt : null });
    await onAction({ type: "unlink-sessions", linkId });
    setEdgeId(null);
  };

  const connect = (from: string, to: string, at: Point) => {
    if (graph.reserved.has(from) || graph.reserved.has(to)) return;
    setPending({ from, to, at });
  };
  const pick = (kind: LinkKind, prompt: string | null) => {
    if (!pending) return;
    void onAction({ type: "connect-sessions", from: pending.from, to: pending.to, kind, prompt });
    setPending(null);
  };


  const titleOf = (id: string) => {
    const agent = graph.nodes.get(id)?.agent;
    return agent ? nodeTitle(agent) : "세션";
  };

  const menuContent = menu
    ? menuFor(menu.target, {
        graph,
        canvas,
        selected: selectedSessions,
        save,
        select: (ids) => select(ids, false),
        onAction,
        onOpenWorktree,
        onConnectFrom: () => setConnecting(true),
        onOpenDoc: openDoc,
        onEditLink: (edgeId: string) => {
          showLead();
          setFocus(SELECTION_TAB);
          setSelected([]);
          setShowAllLinks(false);
          setEdgeId(edgeId);
        },
        onTidy: tidy,
        onLaunchConductor: () => {
          if (menu.target.kind === "cluster") setConductorFor({ clusterId: menu.target.id, at: menu.at });
        },
        onExpandTemplate: () => {
          if (menu.target.kind === "cluster") setTemplateFor({ clusterId: menu.target.id, at: menu.at });
        },
        rest,
        onSaveAsTemplate: (chosen) => setEditing({ template: draftFromSelection(crypto.randomUUID(), chosen, graph.edges, nodeTitle), isNew: true }),
      })
    : null;

  const reservedPick = liveSelected.length === 1 ? graph.reserved.get(liveSelected[0]!) : undefined;
  /** What the canvas selection shows when it is not one session; a single session gets its own tab instead. */
  const selectionView: PanelView | null = showAllLinks
    ? { kind: "all" }
    : selectedEdge
      ? { kind: "edge", edge: selectedEdge }
      : reservedPick
        ? { kind: "run", run: reservedPick.run, cardKey: reservedPick.card.key }
        : liveSelected.length > 1
          ? { kind: "many", count: liveSelected.length }
          : null;
  const activeId =
    focus === SELECTION_TAB && selectionView
      ? SELECTION_TAB
      : sessionTabs.includes(focus)
        ? focus
        : selectionView
          ? SELECTION_TAB
          : (sessionTabs.at(-1) ?? EMPTY_TAB);

  const clearSelection = () => {
    setSelected([]);
    setEdgeId(null);
    setShowAllLinks(false);
  };
  const sidePanel = (view: PanelView) => (
    <SidePanel
      graph={graph}
      view={view}
      renderCard={renderCard}
      onAction={onAction}
      onOpenWorktree={onOpenWorktree}
      onEditRun={(run) => setEditing({ template: { id: run.templateId, name: run.name, cards: run.cards, routes: run.routes, updatedAt: 0 }, isNew: false, run })}
    />
  );
  const leadTabs: CanvasPanelTab[] = [
    ...sessionTabs.flatMap((id): CanvasPanelTab[] => {
      const agent = graph.nodes.get(id)?.agent;
      return agent ? [{ id, label: nodeTitle(agent), content: sidePanel({ kind: "agent", agent }), closable: true }] : [];
    }),
    ...(selectionView ? [{ id: SELECTION_TAB, label: panelLabel(selectionView), content: sidePanel(selectionView), closable: true }] : []),
    ...(sessionTabs.length === 0 && !selectionView ? [{ id: EMPTY_TAB, label: panelLabel({ kind: "empty" }), content: sidePanel({ kind: "empty" }), closable: false }] : []),
  ];
  const activateTab = (id: string) => {
    if (id === SELECTION_TAB || id === EMPTY_TAB) {
      setFocus(SELECTION_TAB);
      return;
    }
    setFocus(id);
    setSelected([id]);
    setEdgeId(null);
    setShowAllLinks(false);
    setPending(null);
  };
  const closeTab = (id: string) => {
    if (id === SELECTION_TAB) {
      clearSelection();
      return;
    }
    writeTabs(sessionTabs.filter((other) => other !== id));
    if (liveSelected.includes(id)) setSelected([]);
  };

  const conductorCluster = conductorFor ? graph.clusters.find((cluster) => cluster.id === conductorFor.clusterId) ?? null : null;
  const templateCluster = templateFor ? graph.clusters.find((cluster) => cluster.id === templateFor.clusterId) ?? null : null;

  /** Double-clicking a box answers it in the side panel, opening the panel if it was folded away. */
  const openNode = (id: string) => {
    select([id], false);
    if (panelCollapsed) writePanelPref([]);
  };

  const states = agents.map((agent) => displayStateOf(agent, rest.restOf));
  const counts = {
    sessions: agents.length,
    myTurn: states.filter((state) => state === "done" || state === "blocked" || state === "waiting").length,
    working: states.filter((state) => state === "working").length,
    paused: states.filter((state) => state === "paused").length,
    dormant: states.filter((state) => state === "dormant").length,
  };

  return (
    <div className="flex h-dvh min-w-0">
      {editing && (
        <TemplateEditor key={editing.run?.id ?? editing.template.id} initial={editing.template} isNew={editing.isNew} run={editing.run} onClose={() => setEditing(null)} />
      )}
      <div className="relative min-w-0 flex-1">
        <CanvasStage
          key={stageKey}
          graph={graph}
          positions={positions}
          anchors={anchors}
          groups={canvas.groups}
          sizes={canvas.sizes}
          projectFrames={scope.kind === "all"}
          selectedIds={new Set(liveSelected)}
          selectedEdgeId={edgeId}
          ends={canvas.ends}
          connecting={connecting}
          viewport={canvas.viewport}
          now={now}
          stepsOf={(worktree) => {
            const task = worktree.flowTasks[0];
            return task ? buildSteps(modeOf(worktree.repo), task, worktree.pullRequest) : null;
          }}
          roundDocOf={(worktree) => roundDocOf(worktree.flowTasks[0])}
          overlay={(zoom) => (
            <>
              {menuContent && menu && <CanvasMenu at={menu.at} zoom={zoom} {...menuContent} onClose={() => setMenu(null)} />}
              {conductorFor && conductorCluster && (
                <ConductorPopover
                  key={conductorFor.clusterId}
                  at={conductorFor.at}
                  zoom={zoom}
                  worktreePath={conductorCluster.worktree.path}
                  worktreeName={conductorCluster.worktree.name}
                  onClose={() => setConductorFor(null)}
                />
              )}
              {templateFor && templateCluster && (
                <TemplatePopover
                  key={templateFor.clusterId}
                  at={templateFor.at}
                  zoom={zoom}
                  worktreePath={templateCluster.worktree.path}
                  worktreeName={templateCluster.worktree.name}
                  branch={templateCluster.worktree.branch}
                  onEdit={(template) => setEditing(template ? { template, isNew: false } : { template: blankTemplate(crypto.randomUUID()), isNew: true })}
                  onDraft={(template) => setEditing({ template, isNew: true })}
                  onClose={() => setTemplateFor(null)}
                />
              )}
              {pending && (
                <ConnectPicker
                  at={pending.at}
                  zoom={zoom}
                  fromTitle={titleOf(pending.from)}
                  toTitle={titleOf(pending.to)}
                  onPick={pick}
                  onCancel={() => setPending(null)}
                />
              )}
            </>
          )}
          onSelect={select}
          onOpenNode={openNode}
          onSelectEdge={(edge: GraphEdge) => {
            showLead();
            setFocus(SELECTION_TAB);
            setSelected([]);
            setShowAllLinks(false);
            setEdgeId(edge.id);
          }}
          onMove={(moved) => save((current) => movePositions(current, moved))}
          onResize={(id, size, at) => save((current) => resizeBox(current, id, size, at))}
          onResetSize={(id) => save((current) => resetSize(current, id))}
          onOpenProject={onOpenProject}
          onConnect={connect}
          onMoveEnd={(edge, end, nodeId, side) => void moveEnd(edge, end, nodeId, side)}
          onContextMenu={(target, at) => {
            setPending(null);
            // Right-clicking a box outside the selection makes it the selection, like Figma.
            if (target.kind === "node" && !liveSelected.includes(target.id)) {
              setSelected([target.id]);
              setEdgeId(null);
              setShowAllLinks(false);
            }
            setMenu({ target, at });
          }}
          onViewportChange={(viewport) => updateCanvas((current) => ({ ...current, viewport }))}
          onOpenWorktree={onOpenWorktree}
          onOpenDoc={openDoc}
          onOpenElsewhere={onOpenElsewhere}
          onRenameGroup={(groupId, name) => save((current) => renameGroup(current, groupId, name))}
          onUngroup={(groupId) => save((current) => ungroup(current, groupId))}
        >
          <div className="pointer-events-none absolute top-4 left-4 flex max-w-[45%] flex-col gap-1.5">
            <div className="pointer-events-auto">{header}</div>
            <p className="text-[12px] text-muted">
              세션 {counts.sessions} · <span className="text-ask">내 차례 {counts.myTurn}</span> · <span className="text-now">작업 중 {counts.working}</span>
              {counts.paused > 0 && <> · <span className="text-accent">멈춤 {counts.paused}</span></>}
              {counts.dormant > 0 && <> · <span className="text-faint">잠자는 중 {counts.dormant}</span></>}
              {connecting && <span className="ml-2 font-semibold text-fg">잇기 모드 · 상자에서 상자로 끌어요 (Esc로 끄기)</span>}
            </p>
          </div>
          <Legend showWorktreeLines={showWorktreeLines} />
          <GraphToolbar
            scope={scope}
            worktrees={worktrees}
            connecting={connecting}
            showAllLinks={showAllLinks}
            canGroup={selectedSessions.length > 0}
            showWorktreeLines={showWorktreeLines}
            onToggleWorktreeLines={() => setShowWorktreeLines((value) => !value)}
            onToggleConnect={() => setConnecting((value) => !value)}
            onToggleRules={() => {
              if (!showAllLinks) {
                showLead();
                setFocus(SELECTION_TAB);
              }
              setShowAllLinks(!showAllLinks);
            }}
            onGroup={groupSelected}
            onTidy={tidy}
          />
        </CanvasStage>
      </div>
      {panelCollapsed ? (
        <button
          type="button"
          onClick={() => writePanelPref([])}
          title="오른쪽 패널 펼치기"
          className="flex h-full w-9 shrink-0 flex-col items-center gap-2 border-l border-hair bg-bg pt-4 text-[12px] font-semibold text-muted hover:bg-tint hover:text-fg"
        >
          <span aria-hidden>«</span>
          {sessionTabs.includes(activeId) && <span className="size-2 rounded-full bg-ask" />}
          {docTabCount > 0 && <span title={`열린 문서 ${docTabCount}개`}>{docTabCount}</span>}
        </button>
      ) : (
        renderPanel({
          tabs: leadTabs,
          activeId,
          onActivate: activateTab,
          onClose: closeTab,
          onCollapse: () => writePanelPref(["collapsed"]),
        })
      )}
    </div>
  );
}
