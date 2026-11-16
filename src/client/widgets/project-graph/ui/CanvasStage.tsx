"use client";

import { useEffect, useRef, useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import type { WorkflowStep } from "@/common/workflow/types";
import { clampZoom, type UserGroup, type Viewport } from "../model/canvasState";
import type { GraphEdge, ProjectGraph } from "../model/graph";
import { clusterRect, groupRect, intersects, NODE_H, NODE_W, nodeRect, type Point, type Rect, unionRect } from "../model/layout";
import { EdgeMarkers, GraphEdges } from "./GraphEdges";
import { ClusterFrame, GroupFrame } from "./Frames";
import { NodeBox } from "./NodeBox";

const DRAG_THRESHOLD = 3;
const FIT_MARGIN = 64;
const INTERACTIVE = "button, input, textarea, select, a, [contenteditable='true'], [data-edge]";

type Gesture =
  | { kind: "pan"; screen: Point; origin: Viewport; moved: boolean }
  | { kind: "move"; ids: string[]; start: Point; delta: Point; moved: boolean; clickId: string | null; additive: boolean }
  | { kind: "marquee"; start: Point; rect: Rect | null; additive: boolean }
  | { kind: "connect"; from: string };

interface Drag {
  ids: ReadonlySet<string>;
  dx: number;
  dy: number;
}

interface CanvasStageProps {
  graph: ProjectGraph;
  positions: ReadonlyMap<string, Point>;
  anchors: ReadonlyMap<string, Point>;
  groups: UserGroup[];
  selectedIds: ReadonlySet<string>;
  selectedEdgeId: string | null;
  connecting: boolean;
  viewport: Viewport | null;
  now: number;
  stepsOf: (worktree: WorktreeSummary) => WorkflowStep[] | null;
  /** World-coordinate extras drawn above the nodes (the ghost box, the line-kind picker); gets the zoom so a popover can stay readable. */
  overlay?: (zoom: number) => React.ReactNode;
  /** Screen-space extras over the canvas (legend). */
  children?: React.ReactNode;
  onSelect: (ids: string[], additive: boolean) => void;
  onSelectEdge: (edge: GraphEdge) => void;
  onMove: (moved: Map<string, Point>) => void;
  onConnect: (from: string, to: string, at: Point) => void;
  onViewportChange: (viewport: Viewport) => void;
  onOpenWorktree: (worktreeId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUngroup: (groupId: string) => void;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

const shifted = (point: Point, drag: Drag | null, id: string): Point => (drag?.ids.has(id) ? { x: point.x + drag.dx, y: point.y + drag.dy } : point);

/**
 * The canvas itself: drag empty space or hold Space to pan, ⌘/pinch + wheel to zoom, drag boxes and
 * frame headers to move them, ⇧ + drag on empty space to select several. Coordinates go through SVG
 * attributes, so nothing here needs an inline style.
 */
export function CanvasStage(props: CanvasStageProps) {
  const { graph, positions, anchors, groups, selectedIds, selectedEdgeId, connecting, viewport, now, stepsOf, overlay, children } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [view, setView] = useState<Viewport>(viewport ?? { x: FIT_MARGIN, y: FIT_MARGIN, zoom: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [connectLine, setConnectLine] = useState<{ from: Point; to: Point } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  const shown = new Map([...positions].map(([id, point]) => [id, shifted(point, drag, id)]));
  const shownAnchor = (id: string) => shifted(anchors.get(id) ?? { x: 0, y: 0 }, drag, id);
  const clusterRects = new Map(graph.clusters.map((cluster) => [cluster.id, clusterRect(cluster.nodeIds, shown, shownAnchor(cluster.id))]));
  const rectOf = (id: string): Rect | null => {
    const point = shown.get(id);
    return point ? nodeRect(point) : (clusterRects.get(id) ?? null);
  };
  const groupRects = groups.flatMap((group) => {
    const rect = groupRect(group.memberIds, shown);
    return rect ? [{ group, rect }] : [];
  });

  const toWorld = (clientX: number, clientY: number): Point => {
    const box = svgRef.current?.getBoundingClientRect();
    return { x: (clientX - (box?.left ?? 0) - view.x) / view.zoom, y: (clientY - (box?.top ?? 0) - view.y) / view.zoom };
  };

  const fit = () => {
    const box = svgRef.current?.getBoundingClientRect();
    const content = unionRect([...[...shown.values()].map(nodeRect), ...clusterRects.values(), ...groupRects.map((entry) => entry.rect)]);
    if (!box || !content || box.width === 0) return;
    const zoom = clampZoom(Math.min(1, (box.width - FIT_MARGIN * 2) / content.w, (box.height - FIT_MARGIN * 2) / content.h));
    setView({ zoom, x: (box.width - content.w * zoom) / 2 - content.x * zoom, y: Math.max(FIT_MARGIN, (box.height - content.h * zoom) / 2) - content.y * zoom });
  };

  const zoomAround = (screenX: number, screenY: number, factor: number) =>
    setView((current) => {
      const zoom = clampZoom(current.zoom * factor);
      const ratio = zoom / current.zoom;
      return { zoom, x: screenX - (screenX - current.x) * ratio, y: screenY - (screenY - current.y) * ratio };
    });

  const zoomFromCenter = (factor: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box) zoomAround(box.width / 2, box.height / 2, factor);
  };

  // Fit once on first open when nothing was saved for this project.
  useEffect(() => {
    if (!viewport) fit();
  }, []);

  // Save the view a moment after it stops changing.
  useEffect(() => {
    if (viewport && viewport.x === view.x && viewport.y === view.y && viewport.zoom === view.zoom) return;
    const timer = setTimeout(() => props.onViewportChange(view), 400);
    return () => clearTimeout(timer);
  }, [view]);

  // Wheel must be non-passive to keep the page from scrolling, which React's onWheel cannot do.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-scroll]")) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const box = svg.getBoundingClientRect();
        zoomAround(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * 0.01));
      } else {
        setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target)) {
        event.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const startPan = event.button === 1 || (event.button === 0 && spaceHeld);
    if (!startPan && (event.button !== 0 || target?.closest(INTERACTIVE))) return;
    const world = toWorld(event.clientX, event.clientY);
    const nodeId = target?.closest("[data-node]")?.getAttribute("data-node") ?? null;
    const handle = target?.closest("[data-drag]");
    if (startPan) {
      gesture.current = { kind: "pan", screen: { x: event.clientX, y: event.clientY }, origin: view, moved: false };
      setPanning(true);
    } else if (nodeId && connecting) {
      gesture.current = { kind: "connect", from: nodeId };
      const rect = rectOf(nodeId);
      if (rect) setConnectLine({ from: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, to: world });
    } else if (nodeId) {
      const ids = selectedIds.has(nodeId) ? [...selectedIds].filter((id) => positions.has(id)) : [nodeId];
      gesture.current = { kind: "move", ids, start: world, delta: { x: 0, y: 0 }, moved: false, clickId: nodeId, additive: event.shiftKey };
    } else if (handle) {
      const id = handle.getAttribute("data-id") ?? "";
      const ids =
        handle.getAttribute("data-drag") === "cluster"
          ? [id, ...(graph.clusters.find((cluster) => cluster.id === id)?.nodeIds ?? [])]
          : (groups.find((group) => group.id === id)?.memberIds ?? []).filter((member) => positions.has(member));
      gesture.current = { kind: "move", ids, start: world, delta: { x: 0, y: 0 }, moved: false, clickId: null, additive: false };
    } else if (event.shiftKey) {
      gesture.current = { kind: "marquee", start: world, rect: null, additive: true };
    } else {
      gesture.current = { kind: "pan", screen: { x: event.clientX, y: event.clientY }, origin: view, moved: false };
      setPanning(true);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pan") {
      const dx = event.clientX - current.screen.x;
      const dy = event.clientY - current.screen.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) current.moved = true;
      setView({ ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy });
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    if (current.kind === "move") {
      const dx = world.x - current.start.x;
      const dy = world.y - current.start.y;
      if (!current.moved && Math.hypot(dx, dy) * view.zoom <= DRAG_THRESHOLD) return;
      current.moved = true;
      current.delta = { x: dx, y: dy };
      setDrag({ ids: new Set(current.ids), dx, dy });
    } else if (current.kind === "marquee") {
      current.rect = {
        x: Math.min(current.start.x, world.x),
        y: Math.min(current.start.y, world.y),
        w: Math.abs(world.x - current.start.x),
        h: Math.abs(world.y - current.start.y),
      };
      setMarquee(current.rect);
    } else {
      setConnectLine((line) => (line ? { ...line, to: world } : line));
    }
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    gesture.current = null;
    setPanning(false);
    if (!current) return;
    if (current.kind === "pan") {
      if (!current.moved) props.onSelect([], false);
    } else if (current.kind === "move") {
      if (current.moved) {
        const { delta } = current;
        props.onMove(
          new Map(
            current.ids.flatMap((id) => {
              const base = positions.get(id) ?? anchors.get(id);
              return base ? [[id, { x: Math.round(base.x + delta.x), y: Math.round(base.y + delta.y) }] as const] : [];
            }),
          ),
        );
      } else if (current.clickId) {
        props.onSelect([current.clickId], current.additive);
      }
      setDrag(null);
    } else if (current.kind === "marquee") {
      const { rect } = current;
      if (rect) {
        props.onSelect(
          [...positions].filter(([, point]) => intersects(rect, nodeRect(point))).map(([id]) => id),
          current.additive,
        );
      }
      setMarquee(null);
    } else {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-node]")?.getAttribute("data-node");
      if (hit && hit !== current.from) props.onConnect(current.from, hit, toWorld(event.clientX, event.clientY));
      setConnectLine(null);
    }
  };

  const delegatedTo = (id: string) => [
    ...new Set(
      graph.edges
        .filter((edge) => edge.kind === "delegate" && edge.from === id)
        .flatMap((edge) => graph.nodes.get(edge.to)?.agent.worktreeName ?? []),
    ),
  ];
  const reportsTo = (id: string) => graph.edges.filter((edge) => edge.kind === "report" && edge.to === id).length;
  const cursor = panning ? "cursor-grabbing" : spaceHeld ? "cursor-grab" : connecting ? "cursor-crosshair" : "cursor-default";

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <svg
        ref={svgRef}
        className={`absolute inset-0 h-full w-full touch-none ${cursor}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="canvas-dots" width={24} height={24} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            <circle cx={1} cy={1} r={1} className="fill-faint/60" />
          </pattern>
        </defs>
        <EdgeMarkers />
        <rect width="100%" height="100%" fill="url(#canvas-dots)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {graph.clusters.map((cluster) => (
            <ClusterFrame
              key={cluster.id}
              id={cluster.id}
              rect={clusterRects.get(cluster.id)!}
              worktree={cluster.worktree}
              steps={stepsOf(cluster.worktree)}
              sessions={cluster.nodeIds.length}
              onOpen={() => props.onOpenWorktree(cluster.worktree.worktreeId)}
            />
          ))}
          {groupRects.map(({ group, rect }) => (
            <GroupFrame key={group.id} rect={rect} group={group} onRename={(name) => props.onRenameGroup(group.id, name)} onUngroup={() => props.onUngroup(group.id)} />
          ))}
          <GraphEdges
            edges={graph.edges}
            rectOf={rectOf}
            selectedId={selectedEdgeId}
            focusClusters={new Set(graph.clusters.filter((cluster) => cluster.nodeIds.some((id) => selectedIds.has(id))).map((cluster) => cluster.id))}
            onSelect={props.onSelectEdge}
          />
          {[...graph.nodes.values()].map((node) => {
            const point = shown.get(node.id);
            if (!point) return null;
            return (
              <foreignObject key={node.id} x={point.x} y={point.y} width={NODE_W} height={NODE_H} data-node={node.id} className="overflow-visible">
                <NodeBox node={node} now={now} selected={selectedIds.has(node.id)} delegatedTo={delegatedTo(node.id)} reports={reportsTo(node.id)} />
              </foreignObject>
            );
          })}
          {connectLine && (
            <path
              d={`M ${connectLine.from.x} ${connectLine.from.y} L ${connectLine.to.x} ${connectLine.to.y}`}
              strokeWidth={2}
              strokeDasharray="4 4"
              className="pointer-events-none stroke-fg"
              markerEnd="url(#edge-arrow-delegate)"
            />
          )}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} strokeWidth={1 / view.zoom} className="pointer-events-none fill-focus/10 stroke-focus" />}
          {overlay?.(view.zoom)}
        </g>
      </svg>
      {children}
      <div className="absolute right-4 bottom-4 flex flex-col overflow-hidden rounded-[10px] bg-bg text-[13px] shadow-[inset_0_0_0_1px_var(--hair)]">
        <button type="button" onClick={() => zoomFromCenter(1.2)} title="확대 (⌘ + 휠)" className="px-3 py-2 hover:bg-tint">
          +
        </button>
        <button type="button" onClick={() => zoomFromCenter(1 / 1.2)} title="축소" className="px-3 py-2 hover:bg-tint">
          −
        </button>
        <button type="button" onClick={fit} title="전체가 보이게 맞추기" className="px-2 py-2 text-[11px] font-semibold hover:bg-tint">
          {Math.round(view.zoom * 100)}%
        </button>
      </div>
    </div>
  );
}
