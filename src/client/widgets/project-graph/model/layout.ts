import { splitByArea, type SessionArea } from "@/client/entities/session-area";
import type { GraphCluster, GraphPort, ProjectGraph } from "./graph";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NODE_W = 264;
export const NODE_H = 112;
const NODE_GAP = 28;
export const CLUSTER_PAD = 20;
export const CLUSTER_HEAD = 40;
const CLUSTER_GAP = 56;
const CONDUCTOR_GAP = 120;
const EMPTY_H = 56;
const GRID_COLUMNS = 2;
const MAX_COLUMNS = 3;
export const AREA_PAD = 14;
export const AREA_HEAD = 32;
const AREA_GAP = 20;
const AREA_MIN_W = NODE_W + AREA_PAD * 2;
export const PROJECT_PAD = 28;
export const PROJECT_HEAD = 48;
const PROJECT_GAP = 72;
const PROJECT_COLUMNS = 3;

export interface Size {
  w: number;
  h: number;
}

export const NODE_SIZE: Size = { w: NODE_W, h: NODE_H };
export const MIN_NODE: Size = { w: 200, h: 88 };
export const MAX_NODE: Size = { w: 880, h: 720 };
const EMPTY_CLUSTER: Size = { w: NODE_W + CLUSTER_PAD * 2, h: CLUSTER_HEAD + EMPTY_H };

/** What a person resized, by node id or cluster id; a box missing here keeps its default size. */
export type Sizes = Readonly<Record<string, Size>>;

export const nodeSize = (sizes: Sizes, id: string): Size => sizes[id] ?? NODE_SIZE;

export interface LayoutOptions {
  sizes?: Sizes;
  /** Every project as its own block of worktrees, for the canvas that shows all projects. */
  byProject?: boolean;
  /** A worktree's named areas; its sessions are laid out area by area below the ones in no area. */
  areasOf?: (worktreeId: string) => SessionArea[];
}

/** Where an area's header sits in the layout's anchors, beside the cluster ids. */
export const areaKey = (areaId: string) => `area:${areaId}`;

export interface AutoLayout {
  /** Top-left corner of every node. */
  positions: Map<string, Point>;
  /** Top-left corner of every cluster, used when it holds no node, and of every area by `areaKey`. */
  anchors: Map<string, Point>;
  /** The cluster each node and area anchor was laid out in, so it can follow a dragged cluster. */
  owners: Map<string, string>;
}

/** Sessions of one cluster as columns: each `next` chain runs downward in its own column. */
export function chainColumns(cluster: GraphCluster, graph: ProjectGraph): string[][] {
  const members = new Set(cluster.nodeIds);
  const nextOf = new Map<string, string>();
  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    if ((edge.kind !== "next" && !edge.route) || !members.has(edge.from) || !members.has(edge.to) || edge.from === edge.to) continue;
    if (nextOf.has(edge.from) || hasIncoming.has(edge.to)) continue;
    nextOf.set(edge.from, edge.to);
    hasIncoming.add(edge.to);
  }
  const seen = new Set<string>();
  const walk = (start: string): string[] => {
    const column: string[] = [];
    // eslint-disable-next-line no-restricted-syntax -- position loop along a chain
    for (let at: string | undefined = start; at && !seen.has(at); at = nextOf.get(at)) {
      seen.add(at);
      column.push(at);
    }
    return column;
  };
  const walked = cluster.nodeIds.filter((id) => !hasIncoming.has(id)).map(walk);
  // Whatever is left sits on a cycle of `next` lines.
  for (const id of cluster.nodeIds) if (!seen.has(id)) walked.push(walk(id));
  const chains = walked.filter((column) => column.length > 1);
  const singles = walked.filter((column) => column.length === 1).flat();
  if (singles.length === 0) return chains;
  // Unchained sessions share at most MAX_COLUMNS columns so a busy worktree grows down, not sideways.
  const singleColumns = Math.min(singles.length, Math.max(1, MAX_COLUMNS - chains.length));
  const packed = Array.from({ length: singleColumns }, (_, column) => singles.filter((_, index) => index % singleColumns === column));
  return [...chains, ...packed];
}

/** Something with a size that can be put down at an origin, so blocks nest: nodes in worktrees, worktrees in projects. */
interface Block extends Size {
  place: (origin: Point) => void;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Blocks in rows of `columns`, each column as wide as its widest block, each row as tall as its tallest. */
function grid(blocks: Block[], columns: number, gap: number): Block {
  const widths = Array.from({ length: columns }, (_, column) => Math.max(0, ...blocks.filter((_, index) => index % columns === column).map((block) => block.w)));
  const columnX = widths.map((_, column) => sum(widths.slice(0, column).map((width) => width + gap)));
  const rows = Array.from({ length: Math.ceil(blocks.length / columns) }, (_, index) => blocks.slice(index * columns, (index + 1) * columns));
  const heights = rows.map((row) => Math.max(...row.map((block) => block.h)));
  const used = Math.min(blocks.length, columns);
  return {
    w: used === 0 ? 0 : columnX[used - 1]! + widths[used - 1]!,
    h: sum(heights) + Math.max(0, rows.length - 1) * gap,
    place: (origin) =>
      rows.forEach((row, rowIndex) => {
        const y = origin.y + sum(heights.slice(0, rowIndex).map((height) => height + gap));
        row.forEach((block, column) => block.place({ x: origin.x + (columnX[column] ?? 0), y }));
      }),
  };
}

/** Sessions as `next` chains in columns, top-left at the origin. */
function columnsBlock(cluster: GraphCluster, ids: string[], graph: ProjectGraph, sizes: Sizes, layout: AutoLayout): Block {
  const columns = chainColumns({ ...cluster, nodeIds: ids }, graph);
  const widths = columns.map((column) => Math.max(...column.map((id) => nodeSize(sizes, id).w)));
  const heights = columns.map((column) => sum(column.map((id) => nodeSize(sizes, id).h)) + (column.length - 1) * NODE_GAP);
  return {
    w: columns.length === 0 ? 0 : sum(widths) + (columns.length - 1) * NODE_GAP,
    h: columns.length === 0 ? 0 : Math.max(...heights),
    place: (origin) =>
      columns.forEach((column, columnIndex) => {
        const x = origin.x + sum(widths.slice(0, columnIndex)) + columnIndex * NODE_GAP;
        column.reduce((y, id) => {
          layout.positions.set(id, { x, y });
          layout.owners.set(id, cluster.id);
          return y + nodeSize(sizes, id).h + NODE_GAP;
        }, origin.y);
      }),
  };
}

/** An area: its header, then its sessions; a folded or empty one is the header alone. */
function areaBlock(cluster: GraphCluster, area: SessionArea, ids: string[], graph: ProjectGraph, sizes: Sizes, layout: AutoLayout): Block {
  const inner = columnsBlock(cluster, area.collapsed ? [] : ids, graph, sizes, layout);
  const open = inner.h > 0;
  return {
    w: Math.max(AREA_MIN_W, inner.w + AREA_PAD * 2),
    h: AREA_HEAD + (open ? inner.h + AREA_PAD : 0),
    place: (origin) => {
      layout.anchors.set(areaKey(area.id), origin);
      layout.owners.set(areaKey(area.id), cluster.id);
      inner.place({ x: origin.x + AREA_PAD, y: origin.y + AREA_HEAD });
    },
  };
}

function clusterBlock(cluster: GraphCluster, graph: ProjectGraph, sizes: Sizes, layout: AutoLayout, areas: SessionArea[]): Block {
  const split = splitByArea(cluster.nodeIds.map((id) => ({ id })), areas);
  const loose = columnsBlock(cluster, split.unassigned.map((item) => item.id), graph, sizes, layout);
  const parts = [
    ...(loose.h > 0 ? [loose] : []),
    ...split.sections.map((section) => areaBlock(cluster, section.area, section.items.map((item) => item.id), graph, sizes, layout)),
  ];
  const content =
    parts.length === 0
      ? EMPTY_CLUSTER
      : {
          w: CLUSTER_PAD * 2 + Math.max(...parts.map((part) => part.w)),
          h: CLUSTER_HEAD + sum(parts.map((part) => part.h)) + (parts.length - 1) * AREA_GAP + CLUSTER_PAD,
        };
  const saved = sizes[cluster.id];
  return {
    w: Math.max(content.w, saved?.w ?? 0),
    h: Math.max(content.h, saved?.h ?? 0),
    place: (origin) => {
      layout.anchors.set(cluster.id, origin);
      parts.reduce((y, part) => {
        part.place({ x: origin.x + CLUSTER_PAD, y });
        return y + part.h + AREA_GAP;
      }, origin.y + CLUSTER_HEAD);
    },
  };
}

/** Clusters in the order given, grouped by project in the order each project first appears. */
function projectBlocks(clusters: Block[], graph: ProjectGraph): Block[] {
  const byRepo = new Map<string, Block[]>();
  graph.clusters.forEach((cluster, index) => byRepo.set(cluster.worktree.repo, [...(byRepo.get(cluster.worktree.repo) ?? []), clusters[index]!]));
  return [...byRepo.values()].map((blocks) => {
    const inner = grid(blocks, blocks.length > 3 ? 2 : 1, CLUSTER_GAP);
    return {
      w: inner.w + PROJECT_PAD * 2,
      h: inner.h + PROJECT_HEAD + PROJECT_PAD,
      place: (origin) => inner.place({ x: origin.x + PROJECT_PAD, y: origin.y + PROJECT_HEAD }),
    };
  });
}

/**
 * The first placement, and what '자동 정리' returns to: conductors in one row on top, worktree
 * clusters below in a two-column grid in sidebar order — or, across projects, each project as a
 * block of its worktrees, three projects to a row. Resized boxes keep their size.
 */
export function autoLayout(graph: ProjectGraph, { sizes = {}, byProject = false, areasOf = () => [] }: LayoutOptions = {}): AutoLayout {
  const layout: AutoLayout = { positions: new Map(), anchors: new Map(), owners: new Map() };
  const conductorSizes = graph.conductors.map((node) => nodeSize(sizes, node.id));
  const top = graph.conductors.length > 0 ? Math.max(...conductorSizes.map((size) => size.h)) + CONDUCTOR_GAP : 0;

  const clusters = graph.clusters.map((cluster) => clusterBlock(cluster, graph, sizes, layout, areasOf(cluster.worktree.worktreeId)));
  const body = byProject ? grid(projectBlocks(clusters, graph), PROJECT_COLUMNS, PROJECT_GAP) : grid(clusters, GRID_COLUMNS, CLUSTER_GAP);
  body.place({ x: 0, y: top });

  const rowWidth = sum(conductorSizes.map((size) => size.w)) + Math.max(0, graph.conductors.length - 1) * NODE_GAP;
  const startX = Math.max(0, (body.w - rowWidth) / 2);
  graph.conductors.reduce((x, node, index) => {
    layout.positions.set(node.id, { x, y: 0 });
    return x + conductorSizes[index]!.w + NODE_GAP;
  }, startX);
  return layout;
}

export const PORT_W = 208;
export const PORT_H = 60;
const PORT_GAP = 32;
/** How far above its sessions a port sits, so the route reads as a long voyage. */
const PORT_DISTANCE = 220;

/**
 * Ports float above the sessions they connect to, wherever those were dragged: each centred over
 * its sessions, then pushed apart left to right so none overlap.
 */
export function portRects(ports: GraphPort[], positions: ReadonlyMap<string, Point>, sizes: Sizes = {}): Map<string, Rect> {
  const placed = ports.flatMap((port) => {
    const points = port.routes.flatMap((route) => {
      const point = positions.get(route.nodeId);
      return point ? [{ ...point, w: nodeSize(sizes, route.nodeId).w }] : [];
    });
    if (points.length === 0) return [];
    const centre = points.reduce((total, point) => total + point.x + point.w / 2, 0) / points.length;
    const top = Math.min(...points.map((point) => point.y));
    return [{ id: port.id, x: centre - PORT_W / 2, y: top - PORT_DISTANCE - PORT_H }];
  });
  placed.sort((a, b) => a.x - b.x);
  const rects = new Map<string, Rect>();
  placed.reduce((right, entry) => {
    const x = Math.max(entry.x, right + PORT_GAP);
    rects.set(entry.id, { x, y: entry.y, w: PORT_W, h: PORT_H });
    return x + PORT_W;
  }, -Infinity);
  return rects;
}

export function nodeRect(point: Point, size: Size = NODE_SIZE): Rect {
  return { x: point.x, y: point.y, w: size.w, h: size.h };
}

function bounds(ids: string[], positions: ReadonlyMap<string, Point>, sizes: Sizes): Rect | null {
  return unionRect(ids.flatMap((id) => {
    const point = positions.get(id);
    return point ? [nodeRect(point, nodeSize(sizes, id))] : [];
  }));
}

/**
 * A worktree cluster follows its sessions wherever they were dragged; an empty one stays at its
 * anchor. One a person resized also covers its anchor at that size, so it never shrinks below it.
 */
export function clusterRect(id: string, nodeIds: string[], positions: ReadonlyMap<string, Point>, anchor: Point, sizes: Sizes = {}, areas: Rect[] = []): Rect {
  const nodes = bounds(nodeIds, positions, sizes);
  const box = unionRect(nodes ? [nodes, ...areas] : areas);
  const content = box
    ? { x: box.x - CLUSTER_PAD, y: box.y - CLUSTER_HEAD, w: box.w + CLUSTER_PAD * 2, h: box.h + CLUSTER_HEAD + CLUSTER_PAD }
    : { ...anchor, ...EMPTY_CLUSTER };
  const saved = sizes[id];
  return saved ? unionRect([content, { ...anchor, ...saved }])! : content;
}

/** An area wraps its shown sessions below its header; folded or empty, it is the header alone at its anchor. */
export function areaRect(memberIds: string[], positions: ReadonlyMap<string, Point>, anchor: Point, sizes: Sizes = {}): Rect {
  const box = bounds(memberIds, positions, sizes);
  if (!box) return { ...anchor, w: AREA_MIN_W, h: AREA_HEAD };
  return { x: box.x - AREA_PAD, y: box.y - AREA_HEAD, w: Math.max(AREA_MIN_W, box.w + AREA_PAD * 2), h: box.h + AREA_HEAD + AREA_PAD };
}

/** A project frame on the all-projects canvas wraps its worktree frames wherever they went. */
export function projectRect(clusterRects: Rect[]): Rect | null {
  const box = unionRect(clusterRects);
  if (!box) return null;
  return { x: box.x - PROJECT_PAD, y: box.y - PROJECT_HEAD, w: box.w + PROJECT_PAD * 2, h: box.h + PROJECT_HEAD + PROJECT_PAD };
}

export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    w: Math.max(...rects.map((rect) => rect.x + rect.w)) - x,
    h: Math.max(...rects.map((rect) => rect.y + rect.h)) - y,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface EdgeGeometry {
  d: string;
  mid: Point;
  start: Point;
  end: Point;
}

export type Side = "top" | "right" | "bottom" | "left";

/** Which side of each box a line leaves and enters, where a person pinned it. */
export interface EdgeEnds {
  from?: Side;
  to?: Side;
}

const NORMAL: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export function sidePoint(rect: Rect, side: Side): Point {
  if (side === "top") return { x: rect.x + rect.w / 2, y: rect.y };
  if (side === "bottom") return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
  if (side === "left") return { x: rect.x, y: rect.y + rect.h / 2 };
  return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
}

/** The side of a box closest to a point, for dropping a line end on it. */
export function nearestSide(rect: Rect, point: Point): Side {
  const sides: Side[] = ["top", "right", "bottom", "left"];
  const distance = (side: Side) => Math.hypot(sidePoint(rect, side).x - point.x, sidePoint(rect, side).y - point.y);
  return sides.reduce((best, side) => (distance(side) < distance(best) ? side : best));
}

/** Top/bottom when one box sits clearly above the other, left/right otherwise. */
function autoSides(from: Rect, to: Rect): { from: Side; to: Side } {
  const vertical = to.y >= from.y + from.h || from.y >= to.y + to.h;
  if (vertical) return to.y + to.h / 2 > from.y + from.h / 2 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
  return to.x + to.w / 2 > from.x + from.w / 2 ? { from: "right", to: "left" } : { from: "left", to: "right" };
}

/**
 * Lines joining the same two boxes, in either direction, grouped so they share one curve and
 * stack their labels on it. Groups keep the order the lines came in.
 */
export function sharedLanes<T extends { from: string; to: string }>(edges: ReadonlyArray<T>): T[][] {
  const lanes = new Map<string, T[]>();
  for (const edge of edges) {
    const pair = [edge.from, edge.to].sort().join("\u0000");
    lanes.set(pair, [...(lanes.get(pair) ?? []), edge]);
  }
  return [...lanes.values()];
}

/** A curve between two boxes, or from a box to a loose point while a line end is being dragged. */
export function edgeGeometry(from: Rect | Point, to: Rect | Point, ends: EdgeEnds = {}): EdgeGeometry {
  const asRect = (value: Rect | Point): Rect => ("w" in value ? value : { x: value.x, y: value.y, w: 0, h: 0 });
  const fromRect = asRect(from);
  const toRect = asRect(to);
  const auto = autoSides(fromRect, toRect);
  const start = sidePoint(fromRect, ends.from ?? auto.from);
  const end = sidePoint(toRect, ends.to ?? auto.to);
  const bend = Math.max(40, Math.hypot(end.x - start.x, end.y - start.y) / 2);
  const outFrom = "w" in from ? NORMAL[ends.from ?? auto.from] : { x: 0, y: 0 };
  const outTo = "w" in to ? NORMAL[ends.to ?? auto.to] : { x: 0, y: 0 };
  const c1 = { x: start.x + outFrom.x * bend, y: start.y + outFrom.y * bend };
  const c2 = { x: end.x + outTo.x * bend, y: end.y + outTo.y * bend };
  const mid = {
    x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y,
  };
  return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`, mid, start, end };
}
