import { openWindow, type ScreenPoint } from "@/client/shared/lib/openWindow";

export function sessionWindowHref(agentId: string): string {
  return `/session?${new URLSearchParams({ id: agentId }).toString()}`;
}

export function openSessionWindow(agentId: string, at?: ScreenPoint): boolean {
  return openWindow(sessionWindowHref(agentId), { width: 820, height: 960 }, `session:${agentId}`, at);
}
