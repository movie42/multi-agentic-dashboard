import "server-only";
import type { RunnerSession } from "@/common/runner/types";
import type { Project } from "@/server/projects/ProjectRegistry";
import type { BoardWorktree } from "./boardCards";

export const PROJECT: Project = { path: "/w", name: "repo", kind: "git" };

export function runnerSession(overrides: Partial<RunnerSession> = {}): RunnerSession {
  return { id: "s1", cwd: "/w", kind: "claude", status: "working", prompted: true, startedAt: 10, updatedAt: 20, exitCode: null, model: null, contextPercent: null, permission: null, ...overrides };
}

export function boardWorktree(overrides: Partial<BoardWorktree> = {}): BoardWorktree {
  return { path: "/w", branch: "feat/x", isMain: false, project: PROJECT, meta: {}, ...overrides };
}
