import { services } from "@/server/container";
import type { ScannedSession } from "@/server/sessions/summarize";

export type { ScannedSession } from "@/server/sessions/summarize";

export function listClaudeSessions(): Promise<ScannedSession[]> {
  return services().sessionIndex.list();
}

export function warmClaudeSessions(): void {
  services().sessionIndex.warm();
}
