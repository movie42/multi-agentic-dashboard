"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { LinkKind } from "@/common/orchestration/types";
import { buildSteps } from "@/common/workflow/steps";
import type { WorkflowMode } from "@/common/workflow/types";
import { fileOverlapsQueryOptions } from "../api/fileOverlapsQuery";
import { groupNodes, groupOf, movePositions, pruneCanvas, renameGroup, resetPositions, resolvePositions, setEdgeEnd, ungroup } from "../model/canvasState";
import { buildGraph, type GraphEdge } from "../model/graph";
import { autoLayout, clusterRect, groupRect, type Point, type Side, unionRect, nodeRect } from "../model/layout";
import { useCanvasState } from "../model/useCanvasState";
import { CanvasStage, type MenuTarget } from "./CanvasStage";
import { CanvasMenu } from "./CanvasMenu";
import { menuFor } from "./canvasMenuItems";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { ConnectPicker, GHOST_ID, GhostNode } from "./CanvasOverlays";
import { GraphToolbar } from "./GraphToolbar";
import { Legend } from "./Legend";
import { nodeTitle } from "./NodeBox";
import { SidePanel, type PanelView } from "./SidePanel";

const GHOST_GAP = 56;

interface PendingConnect {
  from: string;
  to: string;
  at: Point;
}

interface ProjectCanvasProps {
  repo: string;
  /** The project's worktrees in sidebar order. */
  worktrees: WorktreeSummary[];
  /** Every session of the project, orchestrated workers included. */
  agents: AgentCard[];
  mode: WorkflowMode;
  now: number;
  /** Project name, workflow and focus toggle, floated over the top-left corner. */
  header: React.ReactNode;
  renderCard: (agent: AgentCard) => React.ReactNode;
  onAction: (action: ActionRequest) => Promise<void>;
  onOpenWorktree: (worktreeId: string) => void;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * The project overview as a canvas: conductors on top, every worktree as a frame of session boxes,
 * the lines between them, and the selected session answered in the side panel.
 */
export function ProjectCanvas({ repo, worktrees, agents, mode, now, header, renderCard, onAction, onOpenWorktree }: ProjectCanvasProps) {
  // Worktree lines (fork, same files) come from git, not from anything a person connected, so they stay off until asked for.
  const [showWorktreeLines, setShowWorktreeLines] = useState(false);
  const overlapPaths = showWorktreeLines ? worktrees.filter((worktree) => !worktree.isMain).map((worktree) => worktree.path) : [];
  const overlaps = useQuery(fileOverlapsQueryOptions(overlapPaths)).data ?? [];
  const built = buildGraph(agents, worktrees, overlaps);
  const graph = showWorktreeLines ? built : { ...built, edges: built.edges.filter((edge) => edge.kind !== "fork" && edge.kind !== "overlap") };
  const auto = autoLayout(graph);
  const [canvas, updateCanvas] = useCanvasState(repo);
  const positions = resolvePositions(auto.positions, canvas.positions);
  const anchors = resolvePositions(auto.anchors, canvas.positions);

  const [selected, setSelected] = useState<string[]>([]);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [ghostFrom, setGhostFrom] = useState<string | null>(null);
  const [stageKey, setStageKey] = useState(0);
  const [menu, setMenu] = useState<{ target: MenuTarget; at: Point } | null>(null);
  const [panelPref, writePanelPref] = useStoredList("agent-control:canvas-panel");
  const panelCollapsed = panelPref.includes("collapsed");

  const liveIds = new Set([...graph.nodes.keys(), ...graph.clusters.map((cluster) => cluster.id)]);
  const save = (change: (current: typeof canvas) => typeof canvas) => updateCanvas((current) => pruneCanvas(change(current), liveIds));
  const liveSelected = selected.filter((id) => graph.nodes.has(id));
  const selectedEdge = graph.edges.find((edge) => edge.id === edgeId) ?? null;

  const select = (ids: string[], additive: boolean) => {
    const picked = ids.filter((id) => id !== GHOST_ID);
    setMenu(null);
    setEdgeId(null);
    setShowAllLinks(false);
    setPending(null);
    if (!additive) {
      setSelected(picked);
      return;
    }
    const toggled = picked.length === 1 && liveSelected.includes(picked[0]!) ? liveSelected.filter((id) => id !== picked[0]) : [...new Set([...liveSelected, ...picked])];
    setSelected(toggled);
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
        setConnecting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** Same box: pin the end to the side it was dropped on. Another box: the line now runs there instead. */
  const moveEnd = async (edge: GraphEdge, end: "from" | "to", nodeId: string, side: Side) => {
    const linkId = edge.linkId;
    if (!linkId || (edge.kind !== "delegate" && edge.kind !== "report" && edge.kind !== "next")) return;
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
    if (from === GHOST_ID) return;
    if (to === GHOST_ID) {
      setGhostFrom(from);
      setGhostOpen(true);
      return;
    }
    setPending({ from, to, at });
  };
  const pick = (kind: LinkKind, prompt: string | null) => {
    if (!pending) return;
    void onAction({ type: "connect-sessions", from: pending.from, to: pending.to, kind, prompt });
    setPending(null);
  };

  const content = unionRect([
    ...[...positions.values()].map(nodeRect),
    ...graph.clusters.map((cluster) => clusterRect(cluster.nodeIds, positions, anchors.get(cluster.id) ?? { x: 0, y: 0 })),
    ...canvas.groups.flatMap((group) => groupRect(group.memberIds, positions) ?? []),
  ]);
  const ghostAt = { x: content ? content.x : 0, y: content ? content.y + content.h + GHOST_GAP : 0 };
  const linkFromId = ghostFrom ?? (liveSelected.length === 1 ? liveSelected[0]! : null);
  const linkFromAgent = linkFromId ? graph.nodes.get(linkFromId)?.agent : undefined;

  const titleOf = (id: string) => {
    const agent = graph.nodes.get(id)?.agent;
    return agent ? nodeTitle(agent) : "세션";
  };

  const menuContent = menu
    ? menuFor(menu.target, {
        graph,
        canvas,
        selected: liveSelected,
        save,
        select: (ids) => select(ids, false),
        onAction,
        onOpenWorktree,
        onConnectFrom: () => setConnecting(true),
        onEditLink: (edgeId: string) => {
          setSelected([]);
          setShowAllLinks(false);
          setEdgeId(edgeId);
        },
        onTidy: tidy,
      })
    : null;

  const view: PanelView = showAllLinks
    ? { kind: "all" }
    : selectedEdge
      ? { kind: "edge", edge: selectedEdge }
      : liveSelected.length === 1
        ? { kind: "agent", agent: graph.nodes.get(liveSelected[0]!)!.agent }
        : liveSelected.length > 1
          ? { kind: "many", count: liveSelected.length }
          : { kind: "empty" };

  const counts = {
    sessions: agents.length,
    myTurn: agents.filter((agent) => agent.state === "done" || agent.state === "blocked" || agent.state === "waiting").length,
    working: agents.filter((agent) => agent.state === "working").length,
  };

  return (
    <div className="flex h-dvh min-w-0">
      <div className="relative min-w-0 flex-1">
        <CanvasStage
          key={stageKey}
          graph={graph}
          positions={positions}
          anchors={anchors}
          groups={canvas.groups}
          selectedIds={new Set(liveSelected)}
          selectedEdgeId={edgeId}
          ends={canvas.ends}
          connecting={connecting}
          viewport={canvas.viewport}
          now={now}
          stepsOf={(worktree) => {
            const task = worktree.flowTasks[0];
            return task ? buildSteps(mode, task, worktree.pullRequest) : null;
          }}
          overlay={(zoom) => (
            <>
              <GhostNode
                at={ghostAt}
                zoom={zoom}
                worktrees={worktrees}
                linkFrom={linkFromAgent && linkFromId ? { id: linkFromId, title: nodeTitle(linkFromAgent) } : null}
                open={ghostOpen}
                onOpen={() => setGhostOpen(true)}
                onClose={() => {
                  setGhostOpen(false);
                  setGhostFrom(null);
                }}
                onAction={onAction}
              />
              {menuContent && menu && <CanvasMenu at={menu.at} zoom={zoom} {...menuContent} onClose={() => setMenu(null)} />}
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
          onSelectEdge={(edge: GraphEdge) => {
            setSelected([]);
            setShowAllLinks(false);
            setEdgeId(edge.id);
          }}
          onMove={(moved) => save((current) => movePositions(current, moved))}
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
          onRenameGroup={(groupId, name) => save((current) => renameGroup(current, groupId, name))}
          onUngroup={(groupId) => save((current) => ungroup(current, groupId))}
        >
          <div className="pointer-events-none absolute top-4 left-4 flex max-w-[45%] flex-col gap-1.5">
            <div className="pointer-events-auto">{header}</div>
            <p className="text-[12px] text-muted">
              세션 {counts.sessions} · <span className="text-ask">내 차례 {counts.myTurn}</span> · <span className="text-now">작업 중 {counts.working}</span>
              {connecting && <span className="ml-2 font-semibold text-fg">잇기 모드 · 상자에서 상자로 끌어요 (Esc로 끄기)</span>}
            </p>
          </div>
          <Legend showWorktreeLines={showWorktreeLines} />
          <GraphToolbar
            repo={repo}
            worktrees={worktrees}
            connecting={connecting}
            showAllLinks={showAllLinks}
            canGroup={liveSelected.length > 0}
            showWorktreeLines={showWorktreeLines}
            onToggleWorktreeLines={() => setShowWorktreeLines((value) => !value)}
            onToggleConnect={() => setConnecting((value) => !value)}
            onToggleRules={() => setShowAllLinks((value) => !value)}
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
          {view.kind === "agent" && <span className="size-2 rounded-full bg-ask" />}
        </button>
      ) : (
        <SidePanel graph={graph} view={view} renderCard={renderCard} onAction={onAction} onOpenWorktree={onOpenWorktree} onCollapse={() => writePanelPref(["collapsed"])} />
      )}
    </div>
  );
}
