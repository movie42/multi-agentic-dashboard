"use client";

import { useEffect, useRef, useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import type { WorkflowStep } from "@/common/workflow/types";
import { clampZoom, type UserGroup, type Viewport } from "../model/canvasState";
import type { GraphEdge, ProjectGraph } from "../model/graph";
import {
  clusterRect,
  groupRect,
  type EdgeEnds,
  intersects,
  nearestSide,
  NODE_H,
  NODE_W,
  nodeRect,
  type Point,
  type Rect,
  type Side,
  unionRect,
} from "../model/layout";
import { EdgeMarkers, GraphEdges } from "./GraphEdges";
import { ClusterFrame, GroupFrame } from "./Frames";
import { NodeBox } from "./NodeBox";
import { ReservedBox } from "./ReservedBox";

const DRAG_THRESHOLD = 3;
const FIT_MARGIN = 64;
const INTERACTIVE =
  "button, input, textarea, select, a, [contenteditable='true'], [data-edge]";

type Gesture =
  | {
      kind: "pan";
      screen: Point;
      origin: Viewport;
      moved: boolean;
      clickId: string | null;
    }
  | {
      kind: "move";
      ids: string[];
      start: Point;
      delta: Point;
      moved: boolean;
      clickId: string | null;
      additive: boolean;
    }
  | { kind: "marquee"; start: Point; rect: Rect | null; additive: boolean }
  | { kind: "connect"; from: string }
  | { kind: "end"; edge: GraphEdge; end: LineEnd };

type LineEnd = "from" | "to";

/** `select` edits (drag boxes, drag empty space to select several); `hand` only moves the canvas. */
type PointerTool = "select" | "hand";

export type MenuTarget = {
  kind: "node" | "cluster" | "group" | "edge" | "canvas";
  id: string;
};

const DOUBLE_CLICK_MS = 400;

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
  ends: Record<string, EdgeEnds>;
  connecting: boolean;
  viewport: Viewport | null;
  now: number;
  stepsOf: (worktree: WorktreeSummary) => WorkflowStep[] | null;
  /** World-coordinate extras drawn above the nodes (the ghost box, the line-kind picker); gets the zoom so a popover can stay readable. */
  overlay?: (zoom: number) => React.ReactNode;
  /** Screen-space extras over the canvas (legend). */
  children?: React.ReactNode;
  onSelect: (ids: string[], additive: boolean) => void;
  /** A box clicked twice in a row without moving. */
  onOpenNode?: (id: string) => void;
  onSelectEdge: (edge: GraphEdge) => void;
  onMove: (moved: Map<string, Point>) => void;
  onConnect: (from: string, to: string, at: Point) => void;
  /** A line end dropped on a box: the same box moves it to another side, another box reconnects it. */
  onMoveEnd: (
    edge: GraphEdge,
    end: LineEnd,
    nodeId: string,
    side: Side,
  ) => void;
  onContextMenu: (target: MenuTarget, at: Point) => void;
  onViewportChange: (viewport: Viewport) => void;
  onOpenWorktree: (worktreeId: string) => void;
  onOpenProject: (repo: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUngroup: (groupId: string) => void;
}

const TOOL_ICON =
  "h-4 w-4 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]";

const TOOLS: ReadonlyArray<{
  tool: PointerTool;
  label: string;
  key: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    tool: "select",
    label: "편집",
    key: "V",
    hint: "상자를 옮기고, 빈 곳을 끌어 여러 개 골라요",
    icon: (
      <svg viewBox="0 0 16 16" className={TOOL_ICON} aria-hidden>
        <path d="M3.5 2.5l9 4.2-3.9 1.2-1.3 3.9z" />
      </svg>
    ),
  },
  {
    tool: "hand",
    label: "이동",
    key: "H",
    hint: "어디를 끌어도 캔버스가 움직여요",
    icon: (
      <svg viewBox="0 0 16 16" className={TOOL_ICON} aria-hidden>
        <path d="M5.5 8V3.8a1 1 0 0 1 2 0V7.5M7.5 7V3a1 1 0 0 1 2 0v4M9.5 7.2V4a1 1 0 0 1 2 0v5c0 2.8-1.8 4.5-4.2 4.5-1.6 0-2.6-.7-3.5-2L2.6 9.2a1 1 0 0 1 1.6-1.2L5.5 9.5" />
      </svg>
    ),
  },
];

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

const shifted = (point: Point, drag: Drag | null, id: string): Point =>
  drag?.ids.has(id) ? { x: point.x + drag.dx, y: point.y + drag.dy } : point;

/**
 * The canvas itself, with two pointer tools like Figma: 편집 (V) drags boxes and frame headers and
 * drags empty space to select several; 이동 (H) drags anywhere to pan. Space or the middle button pans
 * in either tool, ⌘/pinch + wheel zooms. Coordinates go through SVG
 * attributes, so nothing here needs an inline style.
 */
export function CanvasStage(props: CanvasStageProps) {
  const {
    graph,
    positions,
    anchors,
    groups,
    selectedIds,
    selectedEdgeId,
    ends,
    connecting,
    viewport,
    now,
    stepsOf,
    overlay,
    children,
  } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [view, setView] = useState<Viewport>(
    viewport ?? { x: FIT_MARGIN, y: FIT_MARGIN, zoom: 1 },
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [connectLine, setConnectLine] = useState<{
    from: Point;
    to: Point;
  } | null>(null);
  const [endDrag, setEndDrag] = useState<{
    edgeId: string;
    end: LineEnd;
    point: Point;
  } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [tool, setTool] = useState<PointerTool>("select");

  const shown = new Map(
    [...positions].map(([id, point]) => [id, shifted(point, drag, id)]),
  );
  const shownAnchor = (id: string) =>
    shifted(anchors.get(id) ?? { x: 0, y: 0 }, drag, id);
  const clusterRects = new Map(
    graph.clusters.map((cluster) => [
      cluster.id,
      clusterRect(cluster.nodeIds, shown, shownAnchor(cluster.id)),
    ]),
  );
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
    return {
      x: (clientX - (box?.left ?? 0) - view.x) / view.zoom,
      y: (clientY - (box?.top ?? 0) - view.y) / view.zoom,
    };
  };

  const fit = () => {
    const box = svgRef.current?.getBoundingClientRect();
    const content = unionRect([
      ...[...shown.values()].map(nodeRect),
      ...clusterRects.values(),
      ...groupRects.map((entry) => entry.rect),
    ]);
    if (!box || !content || box.width === 0) return;
    const zoom = clampZoom(
      Math.min(
        1,
        (box.width - FIT_MARGIN * 2) / content.w,
        (box.height - FIT_MARGIN * 2) / content.h,
      ),
    );
    setView({
      zoom,
      x: (box.width - content.w * zoom) / 2 - content.x * zoom,
      y:
        Math.max(FIT_MARGIN, (box.height - content.h * zoom) / 2) -
        content.y * zoom,
    });
  };

  const zoomAround = (screenX: number, screenY: number, factor: number) =>
    setView((current) => {
      const zoom = clampZoom(current.zoom * factor);
      const ratio = zoom / current.zoom;
      return {
        zoom,
        x: screenX - (screenX - current.x) * ratio,
        y: screenY - (screenY - current.y) * ratio,
      };
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
    if (
      viewport &&
      viewport.x === view.x &&
      viewport.y === view.y &&
      viewport.zoom === view.zoom
    )
      return;
    const timer = setTimeout(() => props.onViewportChange(view), 400);
    return () => clearTimeout(timer);
  }, [view]);

  // Wheel must be non-passive to keep the page from scrolling, which React's onWheel cannot do.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-scroll]")
      )
        return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const box = svg.getBoundingClientRect();
        zoomAround(
          event.clientX - box.left,
          event.clientY - box.top,
          Math.exp(-event.deltaY * 0.01),
        );
      } else {
        setView((current) => ({
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setSpaceHeld(true);
      }
      const plain =
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      const inPanel =
        event.target instanceof Element && event.target.closest("aside");
      if (plain && !inPanel && event.code === "KeyV") setTool("select");
      if (plain && !inPanel && event.code === "KeyH") setTool("hand");
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

  const lastClick = useRef<{ id: string; at: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const endHandle = event.button === 0 ? target?.closest("[data-end]") : null;
    const endEdge = endHandle
      ? graph.edges.find(
          (edge) => edge.id === endHandle.getAttribute("data-edge-id"),
        )
      : null;
    if (endHandle && endEdge) {
      gesture.current = {
        kind: "end",
        edge: endEdge,
        end: endHandle.getAttribute("data-end") === "from" ? "from" : "to",
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const startPan =
      event.button === 1 ||
      (event.button === 0 && (spaceHeld || (tool === "hand" && !connecting)));
    if (!startPan && (event.button !== 0 || target?.closest(INTERACTIVE)))
      return;
    const world = toWorld(event.clientX, event.clientY);
    const nodeId =
      target?.closest("[data-node]")?.getAttribute("data-node") ?? null;
    const handle = target?.closest("[data-drag]");
    // The empty inside of a worktree frame counts as the worktree, not the canvas.
    const frame = target?.closest("[data-cluster]")?.getAttribute("data-cluster");
    if (startPan) {
      gesture.current = {
        kind: "pan",
        screen: { x: event.clientX, y: event.clientY },
        origin: view,
        moved: false,
        clickId: nodeId,
      };
      setPanning(true);
    } else if (nodeId && connecting) {
      gesture.current = { kind: "connect", from: nodeId };
      const rect = rectOf(nodeId);
      if (rect)
        setConnectLine({
          from: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
          to: world,
        });
    } else if (nodeId) {
      const ids = selectedIds.has(nodeId)
        ? [...selectedIds].filter((id) => positions.has(id))
        : [nodeId];
      gesture.current = {
        kind: "move",
        ids,
        start: world,
        delta: { x: 0, y: 0 },
        moved: false,
        clickId: nodeId,
        additive: event.shiftKey,
      };
    } else if (handle) {
      const id = handle.getAttribute("data-id") ?? "";
      const ids =
        handle.getAttribute("data-drag") === "cluster"
          ? [
              id,
              ...(graph.clusters.find((cluster) => cluster.id === id)
                ?.nodeIds ?? []),
            ]
          : (groups.find((group) => group.id === id)?.memberIds ?? []).filter(
              (member) => positions.has(member),
            );
      gesture.current = {
        kind: "move",
        ids,
        start: world,
        delta: { x: 0, y: 0 },
        moved: false,
        clickId: null,
        additive: false,
      };
    } else {
      gesture.current = {
        kind: "marquee",
        start: world,
        rect: null,
        additive: event.shiftKey,
      };
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
      setView({
        ...current.origin,
        x: current.origin.x + dx,
        y: current.origin.y + dy,
      });
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    if (current.kind === "end") {
      setEndDrag({ edgeId: current.edge.id, end: current.end, point: world });
    } else if (current.kind === "move") {
      const dx = world.x - current.start.x;
      const dy = world.y - current.start.y;
      if (!current.moved && Math.hypot(dx, dy) * view.zoom <= DRAG_THRESHOLD)
        return;
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
      if (!current.moved)
        props.onSelect(current.clickId ? [current.clickId] : [], false);
    } else if (current.kind === "move") {
      if (current.moved) {
        const { delta } = current;
        props.onMove(
          new Map(
            current.ids.flatMap((id) => {
              const base = positions.get(id) ?? anchors.get(id);
              return base
                ? [
                    [
                      id,
                      {
                        x: Math.round(base.x + delta.x),
                        y: Math.round(base.y + delta.y),
                      },
                    ] as const,
                  ]
                : [];
            }),
          ),
        );
      } else if (current.clickId) {
        props.onSelect([current.clickId], current.additive);
        // Pointer capture retargets the browser's dblclick to the svg, so a second click is timed here.
        const last = lastClick.current;
        const now = event.timeStamp;
        if (last && last.id === current.clickId && now - last.at <= DOUBLE_CLICK_MS) {
          lastClick.current = null;
          props.onOpenNode?.(current.clickId);
        } else {
          lastClick.current = { id: current.clickId, at: now };
        }
      }
      setDrag(null);
    } else if (current.kind === "marquee") {
      const { rect } = current;
      if (rect) {
        props.onSelect(
          [...positions]
            .filter(([, point]) => intersects(rect, nodeRect(point)))
            .map(([id]) => id),
          current.additive,
        );
      } else if (!current.additive) {
        props.onSelect([], false);
      }
      setMarquee(null);
    } else if (current.kind === "end") {
      setEndDrag(null);
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-node]")
        ?.getAttribute("data-node");
      const other =
        current.end === "from" ? current.edge.to : current.edge.from;
      const rect = hit ? rectOf(hit) : null;
      if (hit && rect && hit !== other)
        props.onMoveEnd(
          current.edge,
          current.end,
          hit,
          nearestSide(rect, toWorld(event.clientX, event.clientY)),
        );
    } else {
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-node]")
        ?.getAttribute("data-node");
      if (hit && hit !== current.from)
        props.onConnect(
          current.from,
          hit,
          toWorld(event.clientX, event.clientY),
        );
      setConnectLine(null);
    }
  };

  const onContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const node = target?.closest("[data-node]")?.getAttribute("data-node");
    const handle = target?.closest("[data-drag]");
    // The empty inside of a worktree frame counts as the worktree, not the canvas.
    const frame = target?.closest("[data-cluster]")?.getAttribute("data-cluster");
    const edge = target?.closest("[data-edge]")?.getAttribute("data-edge");
    const hit: MenuTarget = node
      ? { kind: "node", id: node }
      : edge
        ? { kind: "edge", id: edge }
        : handle
          ? {
              kind:
                handle.getAttribute("data-drag") === "group"
                  ? "group"
                  : "cluster",
              id: handle.getAttribute("data-id") ?? "",
            }
          : frame
            ? { kind: "cluster", id: frame }
            : { kind: "canvas", id: "" };
    if (target?.closest("[role='menu']")) return;
    event.preventDefault();
    props.onContextMenu(hit, toWorld(event.clientX, event.clientY));
  };

  const delegatedTo = (id: string) => [
    ...new Set(
      graph.edges
        .filter((edge) => edge.kind === "delegate" && edge.from === id)
        .flatMap((edge) => graph.nodes.get(edge.to)?.agent.worktreeName ?? []),
    ),
  ];
  const reportsTo = (id: string) =>
    graph.edges.filter((edge) => edge.kind === "report" && edge.to === id)
      .length;
  const cursor = panning
    ? "cursor-grabbing"
    : spaceHeld || (tool === "hand" && !connecting)
      ? "cursor-grab"
      : connecting
        ? "cursor-crosshair"
        : "cursor-default";

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <svg
        ref={svgRef}
        className={`absolute inset-0 h-full w-full touch-none ${cursor}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern
            id="canvas-dots"
            width={24}
            height={24}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
          >
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
              sessions={cluster.nodeIds.filter((id) => graph.nodes.has(id)).length}
              empty={cluster.nodeIds.length === 0}
              onOpen={() => props.onOpenWorktree(cluster.worktree.worktreeId)}
            />
          ))}
          {groupRects.map(({ group, rect }) => (
            <GroupFrame
              key={group.id}
              rect={rect}
              group={group}
              onRename={(name) => props.onRenameGroup(group.id, name)}
              onUngroup={() => props.onUngroup(group.id)}
            />
          ))}
          <GraphEdges
            edges={graph.edges}
            rectOf={rectOf}
            ends={ends}
            endDrag={endDrag}
            selectedId={selectedEdgeId}
            focusClusters={
              new Set(
                graph.clusters
                  .filter((cluster) =>
                    cluster.nodeIds.some((id) => selectedIds.has(id)),
                  )
                  .map((cluster) => cluster.id),
              )
            }
            onSelect={props.onSelectEdge}
          />
          {[...graph.nodes.values()].map((node) => {
            const point = shown.get(node.id);
            if (!point) return null;
            return (
              <foreignObject
                key={node.id}
                x={point.x}
                y={point.y}
                width={NODE_W}
                height={NODE_H}
                data-node={node.id}
                className="overflow-visible"
              >
                <NodeBox
                  node={node}
                  now={now}
                  selected={selectedIds.has(node.id)}
                  delegatedTo={delegatedTo(node.id)}
                  reports={reportsTo(node.id)}
                  elsewhere={graph.elsewhere.get(node.id) ?? []}
                  onOpenProject={props.onOpenProject}
                />
              </foreignObject>
            );
          })}
          {[...graph.reserved.values()].map((reserved) => {
            const point = shown.get(reserved.id);
            if (!point) return null;
            return (
              <foreignObject
                key={reserved.id}
                x={point.x}
                y={point.y}
                width={NODE_W}
                height={NODE_H}
                data-node={reserved.id}
                className="overflow-visible"
              >
                <ReservedBox reserved={reserved} selected={selectedIds.has(reserved.id)} />
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
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              strokeWidth={1 / view.zoom}
              className="pointer-events-none fill-focus/10 stroke-focus"
            />
          )}
          {overlay?.(view.zoom)}
        </g>
      </svg>
      {children}
      <div className="absolute right-4 bottom-4 flex flex-col items-end gap-2">
        <div
          role="radiogroup"
          aria-label="마우스 도구"
          className="flex flex-col overflow-hidden rounded-[10px] bg-bg text-[13px] shadow-[inset_0_0_0_1px_var(--hair)]"
        >
          {TOOLS.map((option) => (
            <button
              key={option.tool}
              type="button"
              role="radio"
              aria-checked={tool === option.tool}
              aria-label={option.label}
              title={`${option.label} (${option.key}) · ${option.hint}`}
              onClick={() => setTool(option.tool)}
              className="px-2.5 py-2 text-muted hover:bg-tint aria-checked:bg-fg aria-checked:text-bg"
            >
              {option.icon}
            </button>
          ))}
        </div>
        <div className="flex flex-col overflow-hidden rounded-[10px] bg-bg text-[13px] shadow-[inset_0_0_0_1px_var(--hair)]">
          <button
            type="button"
            onClick={() => zoomFromCenter(1.2)}
            title="확대 (⌘ + 휠)"
            className="px-3 py-2 hover:bg-tint"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomFromCenter(1 / 1.2)}
            title="축소"
            className="px-3 py-2 hover:bg-tint"
          >
            −
          </button>
          <button
            type="button"
            onClick={fit}
            title="전체가 보이게 맞추기"
            className="px-2 py-2 text-[11px] font-semibold hover:bg-tint"
          >
            {Math.round(view.zoom * 100)}%
          </button>
        </div>
      </div>
    </div>
  );
}
