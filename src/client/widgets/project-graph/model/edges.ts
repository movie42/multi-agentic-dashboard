import type { Box } from "./layout";

export type EdgeKind = "branch" | "overlap" | "delegate" | "report" | "next";

export interface GraphEdge {
  id: string;
  kind: EdgeKind;
  from: Box;
  to: Box;
  label: string | null;
  /** Hover text, e.g. the shared file list of an overlap. */
  title?: string;
}

export interface EdgeGeometry {
  d: string;
  labelX: number;
  labelY: number;
}

const HEADER_MID = 18;

/** Boxes in the same band, one left of the other: an edge between them runs across, not down. */
function sideBySide(a: Box, b: Box): boolean {
  const apart = a.x + a.w <= b.x || b.x + b.w <= a.x;
  const sameBand = a.y < b.y + b.h && b.y < a.y + a.h;
  return apart && sameBand;
}

const bottomOf = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h });
const topOf = (box: Box) => ({ x: box.x + box.w / 2, y: box.y });

/** Curves between two boxes: downward edges leave the bottom and enter the top; an overlap dips under both. */
export function edgeGeometry(edge: GraphEdge): EdgeGeometry {
  if (sideBySide(edge.from, edge.to)) {
    // Lanes join at their headers; sessions join at their middles, entering the target from its side.
    const yOf = (box: Box) => box.y + (edge.kind === "overlap" ? HEADER_MID : box.h / 2);
    const forward = edge.from.x < edge.to.x;
    const start = { x: forward ? edge.from.x + edge.from.w : edge.from.x, y: yOf(edge.from) };
    const end = { x: forward ? edge.to.x : edge.to.x + edge.to.w, y: yOf(edge.to) };
    const pull = Math.max(32, Math.abs(end.x - start.x) * 0.5) * (forward ? 1 : -1);
    return { d: `M${start.x} ${start.y} C${start.x + pull} ${start.y}, ${end.x - pull} ${end.y}, ${end.x} ${end.y}`, labelX: (start.x + end.x) / 2, labelY: (start.y + end.y) / 2 };
  }
  if (edge.kind === "overlap") {
    const [left, right] = edge.from.x < edge.to.x ? [edge.from, edge.to] : [edge.to, edge.from];
    const start = { x: left.x + left.w, y: left.y + HEADER_MID };
    const end = { x: right.x, y: right.y + HEADER_MID };
    const pull = Math.max(32, (end.x - start.x) * 0.5);
    return { d: `M${start.x} ${start.y} C${start.x + pull} ${start.y}, ${end.x - pull} ${end.y}, ${end.x} ${end.y}`, labelX: (start.x + end.x) / 2, labelY: (start.y + end.y) / 2 };
  }
  const downward = edge.to.y >= edge.from.y + edge.from.h;
  // A delegation and the report coming back join the same two boxes; keep them side by side.
  const shift = edge.kind === "report" ? 12 : edge.kind === "delegate" ? -12 : 0;
  const rawStart = downward ? bottomOf(edge.from) : topOf(edge.from);
  const rawEnd = downward ? topOf(edge.to) : bottomOf(edge.to);
  const start = { x: rawStart.x + shift, y: rawStart.y };
  const end = { x: rawEnd.x + shift, y: rawEnd.y };
  const bend = Math.max(40, Math.abs(end.y - start.y) * 0.5) * (downward ? 1 : -1);
  return {
    d: `M${start.x} ${start.y} C${start.x} ${start.y + bend}, ${end.x} ${end.y - bend}, ${end.x} ${end.y}`,
    labelX: (start.x + end.x) / 2 + shift * 2.2,
    labelY: (start.y + end.y) / 2,
  };
}
