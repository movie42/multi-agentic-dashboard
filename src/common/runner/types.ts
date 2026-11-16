import type { ConductorLaunch, SessionOrchestration } from "../orchestration/types";

export const RUNNER_PORT = 3198;

export type RunnerStatus = "idle" | "working" | "waiting" | "exited";

export type RunnerSessionKind = "claude" | "shell";

export interface RunnerSession {
  id: string;
  cwd: string;
  kind: RunnerSessionKind;
  status: RunnerStatus;
  prompted: boolean;
  startedAt: number;
  updatedAt: number;
  exitCode: number | null;
  model: string | null;
  contextPercent: number | null;
  /**
   * The Claude Code session the terminal is on now, from hook payloads. It moves away from `id`
   * when `/resume` or `/clear` is run inside the terminal; null until the first hook arrives.
   */
  conversationId: string | null;
  permission: RunnerPermission | null;
  /** Filled by the daemon's orchestration store; null from older daemons. */
  orchestration: SessionOrchestration | null;
}

export type RunnerPermissionSuggestion = Record<string, unknown>;

export interface RunnerPermission {
  id: string;
  receivedAt: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions: RunnerPermissionSuggestion[];
}

export type RunnerPermissionAnswer =
  | { behavior: "allow"; suggestionIndex: number | null }
  | { behavior: "answer"; answers: Record<string, string> }
  | { behavior: "deny"; message: string };

export interface RunnerUsageWindow {
  percent: number;
  resetsAt: string | null;
}

export interface RunnerUsage {
  session: RunnerUsageWindow | null;
  weekly: RunnerUsageWindow | null;
  receivedAt: number;
}

export const RUNNER_USAGE_FILE = "usage.json";

export interface RunnerLaunchRequest {
  cwd: string;
  prompt?: string;
  resumeSessionId?: string;
  kind?: RunnerSessionKind;
  /** Launches the session as a conductor: it gets the daemon's orchestration tools. */
  conductor?: ConductorLaunch;
  /**
   * Keeps Claude's own permission prompts. Sessions a person opens run with permissions bypassed; a
   * conductor's workers keep the prompts so delegated grants and the git push block still apply.
   */
  askPermissions?: boolean;
}

export interface RunnerInputRequest {
  text: string;
  submit?: boolean;
  raw?: boolean;
}

export const RUNNER_HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Notification", "Stop"] as const;

export type RunnerHookEvent = (typeof RUNNER_HOOK_EVENTS)[number];

export type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number };

export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

export interface SessionsMessage {
  type: "sessions";
  sessions: RunnerSession[];
}
