import type { NewThreadInput, PreparedAsk } from "@/server/intentDiff/AskRunner";
import { services } from "@/server/container";
import type { AskEvent, AskThread } from "./types";

export type { NewThreadInput, PreparedAsk };

export function sessionCwd(sessionId: string): Promise<string | null> {
  return services().askRunner.sessionCwd(sessionId);
}

export function prepareNewThread(input: NewThreadInput): Promise<PreparedAsk> {
  return services().askRunner.prepareNewThread(input);
}

export function prepareFollowUp(thread: AskThread, question: string): PreparedAsk {
  return services().askRunner.prepareFollowUp(thread, question);
}

export function runAsk(prepared: PreparedAsk, emit: (event: AskEvent) => void): Promise<void> {
  return services().askRunner.run(prepared, emit);
}
