import type { SessionArea } from "@/client/entities/session-area";
import type { AutoLayout, EdgeEnds, Point, Side, Size } from "./layout";

/** A free group from before areas; read only to turn it into an area (`groupsToAreas`). */
export interface UserGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** What a person arranged on one project's canvas. Anything not here falls back to the auto layout. */
export interface CanvasState {
  /** Node ids and cluster ids (`wt:…`) a person dragged. */
  positions: Record<string, Point>;
  groups: UserGroup[];
  viewport: Viewport | null;
  /** Line ends a person moved to another side of a box, by daemon link id. */
  ends: Record<string, EdgeEnds>;
  /** Boxes and worktree frames a person resized, by node id or cluster id. */
  sizes: Record<string, Size>;
}

export const EMPTY_CANVAS: CanvasState = { positions: {}, groups: [], viewport: null, ends: {}, sizes: {} };

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
const asSide = (value: unknown): Side | undefined => SIDES.find((side) => side === value);

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isSize(value: unknown): value is Size {
  return isRecord(value) && typeof value.w === "number" && typeof value.h === "number" && value.w > 0 && value.h > 0;
}

export function parseCanvasState(raw: string | null): CanvasState {
  if (!raw) return EMPTY_CANVAS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return EMPTY_CANVAS;
    const positions = isRecord(parsed.positions)
      ? Object.fromEntries(Object.entries(parsed.positions).filter((entry): entry is [string, Point] => isPoint(entry[1])))
      : {};
    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.flatMap((group): UserGroup[] =>
          isRecord(group) && typeof group.id === "string" && typeof group.name === "string" && Array.isArray(group.memberIds)
            ? [{ id: group.id, name: group.name, memberIds: group.memberIds.filter((id): id is string => typeof id === "string") }]
            : [],
        )
      : [];
    const viewport =
      isPoint(parsed.viewport) && isRecord(parsed.viewport) && typeof parsed.viewport.zoom === "number"
        ? { x: parsed.viewport.x, y: parsed.viewport.y, zoom: clampZoom(parsed.viewport.zoom) }
        : null;
    const ends = isRecord(parsed.ends)
      ? Object.fromEntries(
          Object.entries(parsed.ends).flatMap(([id, value]): Array<[string, EdgeEnds]> => {
            if (!isRecord(value)) return [];
            const from = asSide(value.from);
            const to = asSide(value.to);
            return from || to ? [[id, { ...(from ? { from } : {}), ...(to ? { to } : {}) }]] : [];
          }),
        )
      : {};
    const sizes = isRecord(parsed.sizes)
      ? Object.fromEntries(Object.entries(parsed.sizes).filter((entry): entry is [string, Size] => isSize(entry[1])))
      : {};
    return { positions, groups, viewport, ends, sizes };
  } catch {
    return EMPTY_CANVAS;
  }
}

/** Saved spots win over the auto layout; ids without one keep their auto spot. */
export function resolvePositions(auto: ReadonlyMap<string, Point>, saved: Record<string, Point>): Map<string, Point> {
  return new Map([...auto].map(([id, point]) => [id, saved[id] ?? point]));
}

/**
 * Saved spots win over the auto layout, except for sessions in an area, which always sit where their
 * area lays them out. Anything on its auto spot moves along with its cluster when that was dragged.
 */
export function resolveLayout(auto: AutoLayout, saved: Record<string, Point>, inArea: ReadonlySet<string>): { positions: Map<string, Point>; anchors: Map<string, Point> } {
  const follow = (id: string, point: Point): Point => {
    const owner = auto.owners.get(id);
    const from = owner ? auto.anchors.get(owner) : undefined;
    const to = owner ? saved[owner] : undefined;
    return from && to ? { x: point.x + to.x - from.x, y: point.y + to.y - from.y } : point;
  };
  return {
    positions: new Map([...auto.positions].map(([id, point]) => [id, (!inArea.has(id) && saved[id]) || follow(id, point)])),
    anchors: new Map([...auto.anchors].map(([id, point]) => [id, saved[id] ?? follow(id, point)])),
  };
}

export function movePositions(state: CanvasState, moved: ReadonlyMap<string, Point>): CanvasState {
  return { ...state, positions: { ...state.positions, ...Object.fromEntries(moved) } };
}

/**
 * Free groups gave way to areas inside a worktree: a group whose sessions all sit in one worktree
 * becomes an area there, keeping its id and name; one that crossed worktrees is dropped. A group with
 * a session not on the board yet is left alone until it is — `settledIds` are the groups to clear.
 */
export function groupsToAreas(
  groups: UserGroup[],
  worktreeOf: (sessionId: string) => string | undefined,
): { areas: Array<{ worktreeId: string; area: SessionArea }>; settledIds: string[] } {
  const settled = groups.filter((group) => group.memberIds.every((id) => worktreeOf(id) !== undefined));
  return {
    areas: settled.flatMap((group) => {
      const worktrees = new Set(group.memberIds.map(worktreeOf));
      const [only] = worktrees;
      return worktrees.size === 1 && only ? [{ worktreeId: only, area: { id: group.id, name: group.name, memberIds: [...group.memberIds], collapsed: false } }] : [];
    }),
    settledIds: settled.map((group) => group.id),
  };
}

/** Drops spots and group members of sessions that closed; the cluster ids stay while the worktree lives. */
export function pruneCanvas(state: CanvasState, liveIds: ReadonlySet<string>): CanvasState {
  const positions = Object.fromEntries(Object.entries(state.positions).filter(([id]) => liveIds.has(id)));
  const sizes = Object.fromEntries(Object.entries(state.sizes).filter(([id]) => liveIds.has(id)));
  const groups = state.groups
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => liveIds.has(id)) }))
    .filter((group) => group.memberIds.length > 0);
  const unchanged =
    Object.keys(positions).length === Object.keys(state.positions).length &&
    Object.keys(sizes).length === Object.keys(state.sizes).length &&
    groups.length === state.groups.length && groups.every((group, index) => group.memberIds.length === state.groups[index]?.memberIds.length);
  return unchanged ? state : { ...state, positions, groups, sizes };
}

/** '자동 정리': every box and line end back to its auto spot, groups and sizes kept. */
export function resetPositions(state: CanvasState): CanvasState {
  return { ...state, positions: {}, ends: {} };
}

export function setEdgeEnd(state: CanvasState, linkId: string, end: "from" | "to", side: Side): CanvasState {
  return { ...state, ends: { ...state.ends, [linkId]: { ...state.ends[linkId], [end]: side } } };
}

/** A resized box or frame; a frame also pins its top-left corner where the resize started. */
export function resizeBox(state: CanvasState, id: string, size: Size, at?: Point): CanvasState {
  return {
    ...state,
    sizes: { ...state.sizes, [id]: size },
    positions: at ? { ...state.positions, [id]: at } : state.positions,
  };
}

/** Back to the default size. */
export function resetSize(state: CanvasState, id: string): CanvasState {
  return { ...state, sizes: Object.fromEntries(Object.entries(state.sizes).filter(([key]) => key !== id)) };
}
