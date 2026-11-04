import { services } from "@/server/container";
import type { LocatedSession } from "@/server/sessions/SessionLocator";

export type { LocatedSession } from "@/server/sessions/SessionLocator";

export function projectDirOf(cwd: string): string {
  return services().sessionLocator.projectDirOf(cwd);
}

export function findSession(
  paneKey: string,
  cwd: string,
  preview: string | null,
  prompt: string | null,
): Promise<LocatedSession | null> {
  return services().sessionLocator.find(paneKey, cwd, preview, prompt);
}
