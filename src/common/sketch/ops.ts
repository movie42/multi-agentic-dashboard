import type { SketchItem, SketchPoint, SketchRect } from "./types";

export const SKETCH_MIN_SIZE = 16;

type PenPoint = [number, number];

export function dragBox(from: SketchPoint, to: SketchPoint): SketchRect {
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
}

export function boundsOf(item: SketchItem): SketchRect {
  if (item.kind === "arrow") return dragBox({ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 });
  if (item.kind === "pen") {
    const xs = item.points.map(([x]) => x);
    const ys = item.points.map(([, y]) => y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return { x: item.x, y: item.y, w: item.w, h: item.h };
}

function shift(item: SketchItem, by: SketchPoint): SketchItem {
  if (item.kind === "arrow") return { ...item, x1: item.x1 + by.x, y1: item.y1 + by.y, x2: item.x2 + by.x, y2: item.y2 + by.y };
  if (item.kind === "pen") return { ...item, points: item.points.map(([x, y]): PenPoint => [x + by.x, y + by.y]) };
  return { ...item, x: item.x + by.x, y: item.y + by.y };
}

export function moveItems(items: SketchItem[], ids: ReadonlySet<string>, by: SketchPoint): SketchItem[] {
  return items.map((item) => (ids.has(item.id) ? shift(item, by) : item));
}

/** A box's bottom-right corner dragged to `corner`; lines and pen strokes have no corner. */
export function resizeItem(item: SketchItem, corner: SketchPoint): SketchItem {
  if (item.kind === "arrow" || item.kind === "pen") return item;
  return { ...item, w: Math.max(SKETCH_MIN_SIZE, corner.x - item.x), h: Math.max(SKETCH_MIN_SIZE, corner.y - item.y) };
}

const touches = (a: SketchRect, b: SketchRect) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

export function hitItems(items: SketchItem[], area: SketchRect): SketchItem[] {
  return items.filter((item) => touches(boundsOf(item), area));
}

/** Keeps a point only once it is `tolerance` away from the last kept one; both ends always stay. */
/** Evenly drops points past `limit` (the save limit), keeping the first and last. */
export function capPoints(points: PenPoint[], limit: number): PenPoint[] {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]).filter((point): point is PenPoint => point !== undefined);
}

export function simplify(points: PenPoint[], tolerance: number): PenPoint[] {
  const [first, ...rest] = points;
  const last = rest.pop();
  if (!first || !last) return points;
  const kept = rest.reduce<PenPoint[]>((acc, point) => {
    const anchor = acc.at(-1) ?? first;
    return Math.hypot(point[0] - anchor[0], point[1] - anchor[1]) < tolerance ? acc : [...acc, point];
  }, [first]);
  return [...kept, last];
}

export function penPath(points: PenPoint[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  const tail = rest.length > 0 ? rest : [[first[0] + 0.01, first[1]] satisfies PenPoint];
  return [`M ${first[0]} ${first[1]}`, ...tail.map(([x, y]) => `L ${x} ${y}`)].join(" ");
}

/** Where the item shows now: shifted by how far its frame moved since it was put there; a gone frame leaves it put. */
export function placed(item: SketchItem, origins: ReadonlyMap<string, SketchPoint>): SketchItem {
  const origin = item.parent ? origins.get(item.parent.id) : undefined;
  if (!item.parent || !origin) return item;
  const by = { x: origin.x - item.parent.x, y: origin.y - item.parent.y };
  return by.x === 0 && by.y === 0 ? item : shift(item, by);
}

/** An item at its shown spot, now belonging to frame `frameId` (or to none). */
export function adopt(item: SketchItem, frameId: string | undefined, origins: ReadonlyMap<string, SketchPoint>): SketchItem {
  const free = { ...item };
  delete free.parent;
  const origin = frameId ? origins.get(frameId) : undefined;
  return frameId && origin ? { ...free, parent: { id: frameId, x: origin.x, y: origin.y } } : free;
}

export function centerOf(item: SketchItem): SketchPoint {
  const box = boundsOf(item);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** Back from the shown spot to the stored one, for an item that keeps its frame. */
export function unplaced(item: SketchItem, parent: NonNullable<SketchItem["parent"]>, origins: ReadonlyMap<string, SketchPoint>): SketchItem {
  const origin = origins.get(parent.id);
  const back = origin ? shift(item, { x: parent.x - origin.x, y: parent.y - origin.y }) : item;
  return { ...back, parent };
}
