import { services } from "@/server/container";
import type { AskThread } from "./types";

export function listThreads(worktreePath: string): Promise<AskThread[]> {
  return services().askStore.list(worktreePath);
}

export function getThread(id: string): Promise<AskThread | null> {
  return services().askStore.get(id);
}

export function saveThread(thread: AskThread): Promise<AskThread> {
  return services().askStore.save(thread);
}

export function askSessionIds(): Promise<Set<string>> {
  return services().askStore.sessionIds();
}
