import type { GraphCluster, ProjectGraph } from "./graph";

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
export const GROUP_PAD = 28;
export const GROUP_HEAD = 30;

export interface AutoLayout {
  /** Top-left corner of every node. */
  positions: Map<string, Point>;
  /** Top-left corner of every cluster, used when it holds no node. */
  anchors: Map<string, Point>;
}

/** Sessions of one cluster as columns: each `next` chain runs downward in its own column. */
export function chainColumns(cluster: GraphCluster, graph: ProjectGraph): string[][] {
  const members = new Set(cluster.nodeIds);
  const nextOf = new Map<string, string>();
  const hasIncoming = new Set<string>();
  for (const edge of graph.edges) {
    if ((edge.kind !== "next" && edge.kind !== "route") || !members.has(edge.from) || !members.has(edge.to) || edge.from === edge.to) continue;
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

function clusterSize(columns: string[][]): { w: number; h: number } {
  if (columns.length === 0) return { w: NODE_W + CLUSTER_PAD * 2, h: CLUSTER_HEAD + EMPTY_H };
  const rows = Math.max(...columns.map((column) => column.length));
  return {
    w: CLUSTER_PAD * 2 + columns.length * NODE_W + (columns.length - 1) * NODE_GAP,
    h: CLUSTER_HEAD + rows * NODE_H + (rows - 1) * NODE_GAP + CLUSTER_PAD,
  };
}

/**
 * The first placement, and what '자동 정리' returns to: conductors in one row on top, worktree
 * clusters below in a two-column grid in sidebar order.
 */
export function autoLayout(graph: ProjectGraph): AutoLayout {
  const positions = new Map<string, Point>();
  const anchors = new Map<string, Point>();
  const top = graph.conductors.length > 0 ? NODE_H + CONDUCTOR_GAP : 0;

  const sized = graph.clusters.map((cluster) => {
    const columns = chainColumns(cluster, graph);
    return { cluster, columns, ...clusterSize(columns) };
  });
  const columnWidths = Array.from({ length: GRID_COLUMNS }, (_, column) =>
    Math.max(0, ...sized.filter((_, index) => index % GRID_COLUMNS === column).map((entry) => entry.w)),
  );
  const columnX = columnWidths.map((_, column) => columnWidths.slice(0, column).reduce((sum, width) => sum + width + CLUSTER_GAP, 0));

  const rows = Array.from({ length: Math.ceil(sized.length / GRID_COLUMNS) }, (_, index) => sized.slice(index * GRID_COLUMNS, (index + 1) * GRID_COLUMNS));
  const rowTops = rows.map((_, index) => rows.slice(0, index).reduce((y, row) => y + Math.max(...row.map((entry) => entry.h)) + CLUSTER_GAP, top));
  rows.forEach((row, rowIndex) => {
    const rowY = rowTops[rowIndex] ?? top;
    row.forEach((entry, column) => {
      const origin = { x: columnX[column] ?? 0, y: rowY };
      anchors.set(entry.cluster.id, origin);
      entry.columns.forEach((ids, columnIndex) => {
        ids.forEach((id, rowIndex) => {
          positions.set(id, {
            x: origin.x + CLUSTER_PAD + columnIndex * (NODE_W + NODE_GAP),
            y: origin.y + CLUSTER_HEAD + rowIndex * (NODE_H + NODE_GAP),
          });
        });
      });
    });
  });

  const gridWidth = sized.length === 0 ? 0 : columnX[Math.min(sized.length, GRID_COLUMNS) - 1]! + columnWidths[Math.min(sized.length, GRID_COLUMNS) - 1]!;
  const rowWidth = graph.conductors.length * NODE_W + (graph.conductors.length - 1) * NODE_GAP;
  const startX = Math.max(0, (gridWidth - rowWidth) / 2);
  graph.conductors.forEach((node, index) => positions.set(node.id, { x: startX + index * (NODE_W + NODE_GAP), y: 0 }));
  return { positions, anchors };
}

export function nodeRect(point: Point): Rect {
  return { x: point.x, y: point.y, w: NODE_W, h: NODE_H };
}

function bounds(points: Point[]): Rect | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + NODE_W - x, h: Math.max(...ys) + NODE_H - y };
}

/** A worktree cluster follows its sessions wherever they were dragged; an empty one stays at its anchor. */
export function clusterRect(nodeIds: string[], positions: ReadonlyMap<string, Point>, anchor: Point): Rect {
  const box = bounds(nodeIds.flatMap((id) => positions.get(id) ?? []));
  if (!box) return { x: anchor.x, y: anchor.y, w: NODE_W + CLUSTER_PAD * 2, h: CLUSTER_HEAD + EMPTY_H };
  return { x: box.x - CLUSTER_PAD, y: box.y - CLUSTER_HEAD, w: box.w + CLUSTER_PAD * 2, h: box.h + CLUSTER_HEAD + CLUSTER_PAD };
}

/** A person's group sits one step outside the clusters it may cross. */
export function groupRect(memberIds: string[], positions: ReadonlyMap<string, Point>): Rect | null {
  const box = bounds(memberIds.flatMap((id) => positions.get(id) ?? []));
  if (!box) return null;
  return { x: box.x - GROUP_PAD, y: box.y - GROUP_PAD - GROUP_HEAD, w: box.w + GROUP_PAD * 2, h: box.h + GROUP_PAD * 2 + GROUP_HEAD };
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

/** A curve between two boxes, or from a box to a loose point while a line end is being dragged. */
export function edgeGeometry(from: Rect | Point, to: Rect | Point, ends: EdgeEnds = {}): EdgeGeometry {
  const asRect = (value: Rect | Point): Rect => ("w" in value ? value : { x: value.x, y: value.y, w: 0, h: 0 });
  const fromRect = asRect(from);
  const toRect = asRect(to);
  const auto = autoSides(fromRect, toRect);
  const fromSide = ends.from ?? auto.from;
  const toSide = ends.to ?? auto.to;
  const start = sidePoint(fromRect, fromSide);
  const end = sidePoint(toRect, toSide);
  const bend = Math.max(40, Math.hypot(end.x - start.x, end.y - start.y) / 2);
  const outFrom = "w" in from ? NORMAL[fromSide] : { x: 0, y: 0 };
  const outTo = "w" in to ? NORMAL[toSide] : { x: 0, y: 0 };
  const c1 = { x: start.x + outFrom.x * bend, y: start.y + outFrom.y * bend };
  const c2 = { x: end.x + outTo.x * bend, y: end.y + outTo.y * bend };
  const mid = {
    x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y,
  };
  return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`, mid, start, end };
}
