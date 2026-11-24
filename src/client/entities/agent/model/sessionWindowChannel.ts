/**
 * How session tabs move between windows: a BroadcastChannel reaches every open window of the app,
 * and a registry in localStorage says which session window holds which sessions.
 */
export const CHANNEL_NAME = "agent-control:session-windows";
const REGISTRY_KEY = "agent-control:session-windows";
export const HEARTBEAT_MS = 2_000;
// A window closing normally leaves on pagehide. Silence only means a crash, and a hidden window's
// timers can be held back to once a minute, so silence has to last well past that.
const STALE_MS = 150_000;

export type SessionWindowMessage =
  /** A window took this session as a tab; whichever window had it lets it go. */
  | { type: "taken"; agentId: string; by: string }
  /** A session window asks the main window to take this session into its right panel. */
  | { type: "dock"; agentId: string; from: string }
  /** Every other session window hands its tabs to `target` and closes. */
  | { type: "merge-into"; target: string }
  | { type: "hand-over"; target: string; agentIds: string[] }
  /** The window holding this session brings it forward. */
  | { type: "focus"; agentId: string };

const WINDOW_ID = crypto.randomUUID();

/** Tells this window apart from the others; also marks the drags that start here. */
export function thisWindowId(): string {
  return WINDOW_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const isText = (value: unknown): value is string => typeof value === "string";

function asMessage(data: unknown): SessionWindowMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "taken":
      return isText(data.agentId) && isText(data.by) ? { type: "taken", agentId: data.agentId, by: data.by } : null;
    case "dock":
      return isText(data.agentId) && isText(data.from) ? { type: "dock", agentId: data.agentId, from: data.from } : null;
    case "merge-into":
      return isText(data.target) ? { type: "merge-into", target: data.target } : null;
    case "hand-over":
      return isText(data.target) && Array.isArray(data.agentIds) && data.agentIds.every(isText)
        ? { type: "hand-over", target: data.target, agentIds: data.agentIds }
        : null;
    case "focus":
      return isText(data.agentId) ? { type: "focus", agentId: data.agentId } : null;
    default:
      return null;
  }
}

/**
 * A channel of its own per post, so the listeners in this window hear it too; every handler tells
 * its own window apart by id.
 */
export function postSessionMessage(message: SessionWindowMessage): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

/** Messages from every window, this one included. */
export function onSessionMessage(handler: (message: SessionWindowMessage) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = asMessage(event.data);
    if (message) handler(message);
  };
  return () => channel.close();
}

export interface TakenWatch {
  /** True once another window has taken the session, waiting up to `ms` for the news. */
  wait: (ms: number) => Promise<boolean>;
  stop: () => void;
}

/**
 * Started when a tab is picked up: the window it lands in announces it, and that news can arrive
 * before or after the drag ends here.
 */
export function watchTaken(agentId: string): TakenWatch {
  const news: { taken: boolean; notify: (() => void) | null } = { taken: false, notify: null };
  const stop = onSessionMessage((message) => {
    if (message.type !== "taken" || message.agentId !== agentId || message.by === thisWindowId()) return;
    news.taken = true;
    news.notify?.();
  });
  return {
    stop,
    wait: (ms) =>
      new Promise<boolean>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          stop();
          resolve(news.taken);
        };
        const timer = setTimeout(finish, ms);
        if (news.taken) finish();
        else news.notify = finish;
      }),
  };
}

/** Which sessions each session window holds, and when it last reported in. */
export type SessionWindowRegistry = Record<string, { agentIds: string[]; seen: number }>;

export function withWindow(registry: SessionWindowRegistry, id: string, agentIds: string[], now: number): SessionWindowRegistry {
  return { ...registry, [id]: { agentIds, seen: now } };
}

export function withoutWindow(registry: SessionWindowRegistry, id: string): SessionWindowRegistry {
  const rest = { ...registry };
  delete rest[id];
  return rest;
}

export function sessionWindowHolding(registry: SessionWindowRegistry, agentId: string, now: number, self: string): string | null {
  const found = Object.entries(registry).find(
    ([id, entry]) => id !== self && now - entry.seen < STALE_MS && entry.agentIds.includes(agentId),
  );
  return found?.[0] ?? null;
}

export function liveSessionWindows(registry: SessionWindowRegistry, now: number, self: string): string[] {
  return Object.entries(registry)
    .filter(([id, entry]) => id !== self && now - entry.seen < STALE_MS)
    .map(([id]) => id);
}

function asRegistry(raw: string | null): SessionWindowRegistry {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, entry]) =>
        isRecord(entry) && Array.isArray(entry.agentIds) && entry.agentIds.every(isText) && typeof entry.seen === "number"
          ? [[id, { agentIds: entry.agentIds, seen: entry.seen }]]
          : [],
      ),
    );
  } catch (error) {
    console.warn("[session-windows] unreadable registry", error);
    return {};
  }
}

export function readRegistry(): SessionWindowRegistry {
  try {
    return asRegistry(window.localStorage.getItem(REGISTRY_KEY));
  } catch (error) {
    console.warn("[session-windows] registry read failed", error);
    return {};
  }
}

export function updateRegistry(change: (registry: SessionWindowRegistry) => SessionWindowRegistry): void {
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(change(readRegistry())));
  } catch (error) {
    console.warn("[session-windows] registry write failed", error);
  }
}
