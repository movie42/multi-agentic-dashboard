import type { RunnerHookEvent, RunnerStatus } from "../../src/common/runner/types.ts";

export interface StatusSignal {
  event: RunnerHookEvent | "exit" | "trust-prompt" | "interrupt";
  notificationType?: string | null;
  /** `session_id` from the hook payload: the Claude Code session the terminal is on now. */
  conversationId?: string | null;
}

export function nextStatus(current: RunnerStatus, signal: StatusSignal): RunnerStatus {
  if (current === "exited") return "exited";
  switch (signal.event) {
    case "exit":
      return "exited";
    case "trust-prompt":
      return "waiting";
    case "interrupt":
      return current === "working" ? "idle" : current;
    case "SessionStart":
      return current === "waiting" ? "idle" : current;
    case "UserPromptSubmit":
    case "PostToolUse":
      return "working";
    case "Stop":
      return "idle";
    case "Notification":
      return signal.notificationType === "idle_prompt" ? current : "waiting";
  }
}
