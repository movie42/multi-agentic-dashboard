import { openWindow, type ScreenPoint } from "@/client/shared/lib/openWindow";
import { postSessionMessage, readRegistry, sessionWindowHolding, thisWindowId, updateRegistry, withWindow } from "./sessionWindowChannel";

export function sessionWindowHref(agentIds: string | readonly string[]): string {
  const ids = typeof agentIds === "string" ? [agentIds] : agentIds;
  return `/session?${new URLSearchParams(ids.map((id) => ["id", id])).toString()}`;
}

/** A window of its own, unless a session window already holds the session as a tab: that one comes forward. */
export function openSessionWindow(agentId: string, at?: ScreenPoint): boolean {
  if (sessionWindowHolding(readRegistry(), agentId, Date.now(), thisWindowId())) {
    postSessionMessage({ type: "focus", agentId });
    return true;
  }
  // Each window gets a fresh name: a named window keeps its name after its tabs move, and reopening
  // that name would replace whatever tabs it holds by then.
  const name = `session-window:${crypto.randomUUID()}`;
  if (!openWindow(sessionWindowHref(agentId), { width: 820, height: 960 }, name, at)) return false;
  // Held under the window's name until its page loads and reports in, so a second click meanwhile
  // brings it forward instead of opening another.
  updateRegistry((registry) => withWindow(registry, name, [agentId], Date.now()));
  return true;
}
