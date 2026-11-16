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
    if (edge.kind !== "next" || !members.has(edge.from) || !members.has(edge.to) || edge.from === edge.to) continue;
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
  end: Point;
}

/**
 * A curve between two boxes: top/bottom edges when one sits clearly above the other, left/right
 * edges otherwise.
 */
export function edgeGeometry(from: Rect, to: Rect): EdgeGeometry {
  const fromCenter = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toCenter = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const vertical = to.y >= from.y + from.h || from.y >= to.y + to.h;
  const [start, end, c1, c2] = vertical
    ? (() => {
        const down = toCenter.y > fromCenter.y;
        const s = { x: fromCenter.x, y: down ? from.y + from.h : from.y };
        const e = { x: toCenter.x, y: down ? to.y : to.y + to.h };
        const bend = Math.max(40, Math.abs(e.y - s.y) / 2);
        return [s, e, { x: s.x, y: s.y + (down ? bend : -bend) }, { x: e.x, y: e.y - (down ? bend : -bend) }];
      })()
    : (() => {
        const right = toCenter.x > fromCenter.x;
        const s = { x: right ? from.x + from.w : from.x, y: fromCenter.y };
        const e = { x: right ? to.x : to.x + to.w, y: toCenter.y };
        const bend = Math.max(40, Math.abs(e.x - s.x) / 2);
        return [s, e, { x: s.x + (right ? bend : -bend), y: s.y }, { x: e.x - (right ? bend : -bend), y: e.y }];
      })();
  const mid = {
    x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y,
  };
  return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`, mid, end };
}
