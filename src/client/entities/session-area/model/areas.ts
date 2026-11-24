/** A named part of one worktree's sessions ("하고 있는 일", "나중에 볼 일"); a session sits in one area at most. */
export interface SessionArea {
  id: string;
  name: string;
  memberIds: string[];
  collapsed: boolean;
}

export interface AreaSection<T> {
  area: SessionArea;
  items: T[];
}

export interface AreaSplit<T> {
  /** Sessions in no area, new ones included; shown first, without a header. */
  unassigned: T[];
  sections: AreaSection<T>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAreas(raw: string | null): SessionArea[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): SessionArea[] =>
      isRecord(entry) && typeof entry.id === "string" && typeof entry.name === "string"
        ? [
            {
              id: entry.id,
              name: entry.name,
              memberIds: Array.isArray(entry.memberIds) ? entry.memberIds.filter((id): id is string => typeof id === "string") : [],
              collapsed: entry.collapsed === true,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

const without = (areas: SessionArea[], ids: ReadonlySet<string>): SessionArea[] =>
  areas.map((area) => (area.memberIds.some((id) => ids.has(id)) ? { ...area, memberIds: area.memberIds.filter((id) => !ids.has(id)) } : area));

export function addArea(areas: SessionArea[], id: string, name: string, memberIds: string[] = []): SessionArea[] {
  return [...without(areas, new Set(memberIds)), { id, name, memberIds: [...memberIds], collapsed: false }];
}

/** `areaId` null takes the sessions out of every area. */
export function assignArea(areas: SessionArea[], sessionIds: string[], areaId: string | null): SessionArea[] {
  const rest = without(areas, new Set(sessionIds));
  if (areaId === null) return rest;
  return rest.map((area) => (area.id === areaId ? { ...area, memberIds: [...area.memberIds, ...sessionIds] } : area));
}

export function renameArea(areas: SessionArea[], areaId: string, name: string): SessionArea[] {
  return areas.map((area) => (area.id === areaId ? { ...area, name } : area));
}

export function toggleArea(areas: SessionArea[], areaId: string): SessionArea[] {
  return areas.map((area) => (area.id === areaId ? { ...area, collapsed: !area.collapsed } : area));
}

export function removeArea(areas: SessionArea[], areaId: string): SessionArea[] {
  return areas.filter((area) => area.id !== areaId);
}

export function areaOf(areas: SessionArea[], sessionId: string): SessionArea | null {
  return areas.find((area) => area.memberIds.includes(sessionId)) ?? null;
}

/** Keeps the sessions' own order inside every part; areas come in their saved order. */
export function splitByArea<T extends { id: string }>(items: T[], areas: SessionArea[]): AreaSplit<T> {
  const areaIdOf = new Map(areas.flatMap((area) => area.memberIds.map((id) => [id, area.id] as const)));
  return {
    unassigned: items.filter((item) => !areaIdOf.has(item.id)),
    sections: areas.map((area) => ({ area, items: items.filter((item) => areaIdOf.get(item.id) === area.id) })),
  };
}
