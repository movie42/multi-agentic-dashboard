import type { RunnerHookEvent, RunnerStatus } from "../../src/common/runner/types.ts";

export interface StatusSignal {
  event: RunnerHookEvent | "exit" | "trust-prompt" | "interrupt" | "menu-open" | "menu-closed" | "permission-answered";
  notificationType?: string | null;
  /** `session_id` from the hook payload: the Claude Code session the terminal is on now. */
  conversationId?: string | null;
  /** `permission_mode` from the hook payload. */
  permissionMode?: string | null;
}

export function nextStatus(current: RunnerStatus, signal: StatusSignal): RunnerStatus {
  if (current === "exited") return "exited";
  switch (signal.event) {
    case "exit":
      return "exited";
    case "trust-prompt":
      return "waiting";
    case "menu-open":
      return current === "idle" ? "waiting" : current;
    case "menu-closed":
      return current === "waiting" ? "idle" : current;
    // No hook fires between the answer and the tool's PostToolUse, which a long command delays by minutes.
    case "permission-answered":
      return current === "waiting" ? "working" : current;
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
