import type { AgentCard, WorktreeSummary } from "@/common/board/types";

export const NODE_W = 184;
export const NODE_H = 74;
const GAP_X = 24;
const GAP_Y = 44;
const LANE_PAD = 16;
const LANE_HEAD = 40;
const LANE_GAP_X = 40;
const LANE_GAP_Y = 64;
const TOP_GAP = 96;
const EMPTY_ROW = 44;
const MAX_COLS = 2;
/** A lane with more sessions than this gets a third column so it does not tower over its row. */
const WIDE_AFTER = 6;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaneLayout extends Box {
  worktree: WorktreeSummary;
}

export interface NodeLayout extends Box {
  agent: AgentCard;
  laneId: string | null;
}

export interface GraphLayout {
  lanes: LaneLayout[];
  nodes: NodeLayout[];
  width: number;
  height: number;
}

export interface LayoutInput {
  /** Worktrees in display order; a child follows the order too but is drawn under its parent. */
  worktrees: WorktreeSummary[];
  /** Sessions per worktree id, already in display order. */
  agentsOf: (worktreeId: string) => AgentCard[];
  /** Sessions drawn above every lane (project-level conductors). */
  top: AgentCard[];
}

function laneSize(count: number): { w: number; h: number; cols: number } {
  const cols = Math.max(1, Math.min(count > WIDE_AFTER ? MAX_COLS + 1 : MAX_COLS, count));
  const rows = Math.ceil(count / cols);
  const body = rows === 0 ? EMPTY_ROW : rows * NODE_H + (rows - 1) * GAP_Y;
  return { cols, w: LANE_PAD * 2 + cols * NODE_W + (cols - 1) * GAP_X, h: LANE_HEAD + body + LANE_PAD };
}

interface Block {
  worktree: WorktreeSummary;
  lane: { w: number; h: number; cols: number };
  children: Block[];
  width: number;
  height: number;
}

const ASPECT = 1.6;
const MIN_ROW_WIDTH = 1200;

/** Root subtrees wrapped into rows so the whole graph stays near a screen's shape instead of one long strip. */
function packRows(roots: Block[]): Block[][] {
  if (roots.length === 0) return [];
  const area = roots.reduce((sum, root) => sum + root.width * root.height, 0);
  const limit = Math.max(MIN_ROW_WIDTH, Math.sqrt(area * ASPECT) * 1.15, ...roots.map((root) => root.width));
  const rows: Block[][] = [[]];
  let used = 0; // eslint-disable-line no-restricted-syntax -- running width of the open row
  for (const root of roots) {
    const extra = (used > 0 ? LANE_GAP_X : 0) + root.width;
    if (used > 0 && used + extra > limit) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]?.push(root);
    used += used > 0 ? LANE_GAP_X + root.width : root.width;
  }
  return rows;
}

/**
 * Lanes form a tree by `parentWorktreeId`: each lane sits above the lanes branched from it, and
 * sibling subtrees run left to right. Sessions fill a lane two per row.
 */
export function layoutGraph({ worktrees, agentsOf, top }: LayoutInput): GraphLayout {
  const ids = new Set(worktrees.map((worktree) => worktree.worktreeId));
  const parentOf = (worktree: WorktreeSummary) =>
    worktree.parentWorktreeId !== null && ids.has(worktree.parentWorktreeId) && worktree.parentWorktreeId !== worktree.worktreeId
      ? worktree.parentWorktreeId
      : null;
  const seen = new Set<string>();
  const build = (worktree: WorktreeSummary): Block => {
    seen.add(worktree.worktreeId);
    const lane = laneSize(agentsOf(worktree.worktreeId).length);
    const children = worktrees
      .filter((candidate) => parentOf(candidate) === worktree.worktreeId && !seen.has(candidate.worktreeId))
      .map(build);
    const childWidth = children.reduce((sum, child) => sum + child.width, 0) + Math.max(0, children.length - 1) * LANE_GAP_X;
    const childHeight = Math.max(0, ...children.map((child) => child.height));
    return {
      worktree,
      lane,
      children,
      width: Math.max(lane.w, childWidth),
      height: lane.h + (children.length > 0 ? LANE_GAP_Y + childHeight : 0),
    };
  };
  const roots = worktrees.filter((worktree) => parentOf(worktree) === null).map(build);

  const topWidth = top.length * NODE_W + Math.max(0, top.length - 1) * GAP_X;
  const lanesTop = top.length > 0 ? NODE_H + TOP_GAP : 0;
  const lanes: LaneLayout[] = [];
  const nodes: NodeLayout[] = [];

  const place = (block: Block, x: number, y: number) => {
    const laneX = x + (block.width - block.lane.w) / 2;
    lanes.push({ worktree: block.worktree, x: laneX, y, w: block.lane.w, h: block.lane.h });
    agentsOf(block.worktree.worktreeId).forEach((agent, index) => {
      const col = index % block.lane.cols;
      const row = Math.floor(index / block.lane.cols);
      nodes.push({
        agent,
        laneId: block.worktree.worktreeId,
        x: laneX + LANE_PAD + col * (NODE_W + GAP_X),
        y: y + LANE_HEAD + row * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
      });
    });
    const childWidth = block.children.reduce((sum, child) => sum + child.width, 0) + Math.max(0, block.children.length - 1) * LANE_GAP_X;
    let childX = x + (block.width - childWidth) / 2; // eslint-disable-line no-restricted-syntax -- running offset
    for (const child of block.children) {
      place(child, childX, y + block.lane.h + LANE_GAP_Y);
      childX += child.width + LANE_GAP_X;
    }
  };

  const rows = packRows(roots);
  const rowWidth = (row: Block[]) => row.reduce((sum, root) => sum + root.width, 0) + Math.max(0, row.length - 1) * LANE_GAP_X;
  const width = Math.max(topWidth, ...rows.map(rowWidth));
  let rowY = lanesTop; // eslint-disable-line no-restricted-syntax -- running offset
  for (const row of rows) {
    let rootX = (width - rowWidth(row)) / 2; // eslint-disable-line no-restricted-syntax -- running offset
    for (const root of row) {
      place(root, rootX, rowY);
      rootX += root.width + LANE_GAP_X;
    }
    rowY += Math.max(...row.map((root) => root.height)) + LANE_GAP_Y;
  }
  top.forEach((agent, index) => {
    nodes.push({ agent, laneId: null, x: (width - topWidth) / 2 + index * (NODE_W + GAP_X), y: 0, w: NODE_W, h: NODE_H });
  });

  const height = Math.max(lanesTop, ...lanes.map((lane) => lane.y + lane.h), top.length > 0 ? NODE_H : 0);
  return { lanes, nodes, width, height };
}
