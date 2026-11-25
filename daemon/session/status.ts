import type { RunnerHookEvent, RunnerStatus } from "../../src/common/runner/types.ts";

export interface StatusSignal {
  event: RunnerHookEvent | "exit" | "trust-prompt" | "interrupt" | "compact-ended" | "menu-open" | "menu-closed" | "permission-answered";
  notificationType?: string | null;
  /** `session_id` from the hook payload: the Claude Code session the terminal is on now. */
  conversationId?: string | null;
  /** `permission_mode` from the hook payload. */
  permissionMode?: string | null;
  /** `trigger` from a PreCompact payload: `manual` for /compact, `auto` when the context fills mid-turn. */
  compactTrigger?: string | null;
  /** `source` from a SessionStart payload: `startup`, `resume`, `clear` or `compact`. */
  sessionSource?: string | null;
  /** Set by the registry: this SessionStart closes a /compact, which sends no Stop hook. */
  endsCompact?: boolean;
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
    case "compact-ended":
      return current === "working" ? "idle" : current;
    case "SessionStart":
      // A /clear leaves nothing running, so it also clears a status no hook came to end.
      return current === "waiting" || signal.endsCompact || signal.sessionSource === "clear" ? "idle" : current;
    case "PreCompact":
      return signal.compactTrigger === "manual" ? "working" : current;
    case "UserPromptSubmit":
    case "PostToolUse":
      return "working";
    case "Stop":
      return "idle";
    case "Notification":
      return signal.notificationType === "idle_prompt" ? current : "waiting";
  }
}
