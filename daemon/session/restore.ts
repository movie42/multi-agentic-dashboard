import type { RunnerLaunchRequest, RunnerSession, RunnerSessionKind } from "../../src/common/runner/types.ts";

export const SESSIONS_FILE = "sessions.json";

export interface SavedSession {
  id: string;
  cwd: string;
  kind: RunnerSessionKind;
  prompted: boolean;
  startedAt: number;
}

export interface RestoreRequest {
  launch: RunnerLaunchRequest;
  startedAt: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

export function savedSessionsOf(sessions: RunnerSession[]): SavedSession[] {
  return sessions
    .filter((session) => session.status !== "exited")
    // Resume the conversation the terminal ended on, which differs from `id` after `/resume`.
    .map(({ id, conversationId, cwd, kind, prompted, startedAt }) => ({ id: conversationId ?? id, cwd, kind, prompted, startedAt }))
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function parseSavedSessions(body: unknown): SavedSession[] {
  const list = record(body)?.sessions;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown) => {
    const raw = record(item);
    if (!raw) return [];
    const { id, cwd, kind, prompted, startedAt } = raw;
    if (typeof id !== "string" || !id || typeof cwd !== "string" || !cwd.startsWith("/")) return [];
    if (kind !== "claude" && kind !== "shell") return [];
    if (typeof prompted !== "boolean" || typeof startedAt !== "number" || !Number.isFinite(startedAt)) return [];
    return [{ id, cwd, kind, prompted, startedAt }];
  });
}

export function restoreRequestsOf(saved: SavedSession[]): RestoreRequest[] {
  return [...saved]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((session) => ({
      startedAt: session.startedAt,
      launch:
        session.kind === "shell"
          ? { cwd: session.cwd, kind: "shell" }
          : session.prompted
            ? { cwd: session.cwd, resumeSessionId: session.id }
            : { cwd: session.cwd },
    }));
}
