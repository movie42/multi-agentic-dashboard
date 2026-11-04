import { services } from "@/server/container";
import type { SessionRef } from "./types";

export { TITLE_LIMIT } from "@/common/sessions/limits";

export function sessionRefOf(file: string, size: number): Promise<SessionRef> {
  return services().sessionTitles.refOf(file, size);
}

export function transcriptOf(sessionId: string): Promise<string> {
  return services().sessionTitles.transcriptOf(sessionId);
}

export function renameSession(sessionId: string, title: string): Promise<void> {
  return services().sessionTitles.rename(sessionId, title);
}
