import type { Point } from "./layout";

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
}

export const EMPTY_CANVAS: CanvasState = { positions: {}, groups: [], viewport: null };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
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
    return { positions, groups, viewport };
  } catch {
    return EMPTY_CANVAS;
  }
}

/** Saved spots win over the auto layout; ids without one keep their auto spot. */
export function resolvePositions(auto: ReadonlyMap<string, Point>, saved: Record<string, Point>): Map<string, Point> {
  return new Map([...auto].map(([id, point]) => [id, saved[id] ?? point]));
}

export function movePositions(state: CanvasState, moved: ReadonlyMap<string, Point>): CanvasState {
  return { ...state, positions: { ...state.positions, ...Object.fromEntries(moved) } };
}

/**
 * Groups the given nodes into a new group. A node belongs to one group at most, so it leaves the
 * group it was in; a group left empty disappears.
 */
export function groupNodes(state: CanvasState, ids: string[], id: string, name: string): CanvasState {
  if (ids.length === 0) return state;
  const taken = new Set(ids);
  const rest = state.groups
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((member) => !taken.has(member)) }))
    .filter((group) => group.memberIds.length > 0);
  return { ...state, groups: [...rest, { id, name, memberIds: [...ids] }] };
}

export function ungroup(state: CanvasState, groupId: string): CanvasState {
  return { ...state, groups: state.groups.filter((group) => group.id !== groupId) };
}

export function renameGroup(state: CanvasState, groupId: string, name: string): CanvasState {
  return { ...state, groups: state.groups.map((group) => (group.id === groupId ? { ...group, name } : group)) };
}

export function groupOf(state: CanvasState, nodeId: string): UserGroup | null {
  return state.groups.find((group) => group.memberIds.includes(nodeId)) ?? null;
}

/** Drops spots and group members of sessions that closed; the cluster ids stay while the worktree lives. */
export function pruneCanvas(state: CanvasState, liveIds: ReadonlySet<string>): CanvasState {
  const positions = Object.fromEntries(Object.entries(state.positions).filter(([id]) => liveIds.has(id)));
  const groups = state.groups
    .map((group) => ({ ...group, memberIds: group.memberIds.filter((id) => liveIds.has(id)) }))
    .filter((group) => group.memberIds.length > 0);
  const unchanged = Object.keys(positions).length === Object.keys(state.positions).length && groups.length === state.groups.length && groups.every((group, index) => group.memberIds.length === state.groups[index]?.memberIds.length);
  return unchanged ? state : { ...state, positions, groups };
}

/** '자동 정리': every box back to its auto spot, groups kept. */
export function resetPositions(state: CanvasState): CanvasState {
  return { ...state, positions: {} };
}
