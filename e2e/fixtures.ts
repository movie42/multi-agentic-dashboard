import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3197);
export const RUNNER_PORT = Number(process.env.E2E_RUNNER_PORT ?? 3196);
export const ROOT = path.resolve(process.cwd(), "e2e", ".tmp");
export const RUNNER_DIR = path.join(ROOT, "runner");
export const WORKTREE = path.join(ROOT, "worktree");
export const SESSION_ID = "aaaaaaaa-0000-4000-8000-000000000001";
export const CALLS = path.join(RUNNER_DIR, "calls.jsonl");

const line = (value: unknown) => JSON.stringify(value);

export function prepareFixtures(): void {
  rmSync(ROOT, { recursive: true, force: true });
  for (const dir of [RUNNER_DIR, WORKTREE, path.join(ROOT, "projects"), path.join(ROOT, "share")]) {
    mkdirSync(dir, { recursive: true });
  }
  execFileSync("git", ["init", "-q", "-b", "main", WORKTREE]);
  execFileSync("git", ["-C", WORKTREE, "-c", "user.name=e2e", "-c", "user.email=e2e@example.com", "commit", "-q", "--allow-empty", "-m", "init"]);
  const worktree = realpathSync(WORKTREE);
  writeFileSync(CALLS, "");
  const now = Date.now();
  writeFileSync(path.join(ROOT, "share", "projects.json"), line({ projects: [{ path: worktree, name: "e2e-repo", kind: "git" }] }));
  writeFileSync(path.join(ROOT, "share", "worktrees.json"), line({ worktrees: { [worktree]: { displayName: "e2e-worktree" } } }));
  writeFileSync(
    path.join(RUNNER_DIR, "sessions.json"),
    line([{ id: SESSION_ID, cwd: worktree, kind: "claude", status: "waiting", prompted: true, startedAt: now - 120_000, updatedAt: now - 60_000, exitCode: null, model: "Opus 5.5", contextPercent: 34, permission: { id: "p1", receivedAt: now - 30_000, toolName: "Bash", toolInput: { command: "rm -rf dist" }, suggestions: [] } }]),
  );
  const transcriptDir = path.join(ROOT, "projects", worktree.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(
    path.join(transcriptDir, `${SESSION_ID}.jsonl`),
    [
      line({ type: "user", sessionId: SESSION_ID, cwd: worktree, timestamp: new Date(now - 120_000).toISOString(), message: { role: "user", content: "E2E 고정 프롬프트" } }),
      line({ type: "assistant", sessionId: SESSION_ID, timestamp: new Date(now - 60_000).toISOString(), message: { role: "assistant", content: [{ type: "text", text: "E2E 마지막 답변" }] } }),
    ].join("\n") + "\n",
  );
}

export function runnerEnv(): Record<string, string> {
  return { FAKE_RUNNER_DIR: RUNNER_DIR, RUNNER_PORT: String(RUNNER_PORT) };
}

export function serverEnv(): Record<string, string> {
  return {
    RUNNER_PORT: String(RUNNER_PORT),
    NEXT_PUBLIC_RUNNER_ORIGIN: `http://127.0.0.1:${RUNNER_PORT}`,
    PROJECTS_FILE: path.join(ROOT, "share", "projects.json"),
    WORKTREE_META_FILE: path.join(ROOT, "share", "worktrees.json"),
    TODO_FILE: path.join(ROOT, "share", "todos.json"),
    CLAUDE_PROJECTS_DIR: path.join(ROOT, "projects"),
    AGENT_CONTROL_ASK_FILE: path.join(ROOT, "share", "ask-threads.json"),
    SB_FILE: path.join(ROOT, "share", "bookmarks.jsonl"),
    INTENT_DIFF_ARCHIVE_DIR: path.join(ROOT, "share", "intent-diff"),
    CURSOR_SETTINGS_FILE: path.join(ROOT, "share", "cursor-settings.json"),
    AGENT_CONTROL_LOG_FILE: path.join(ROOT, "share", "app.log"),
    AGENT_CONTROL_CACHE_DIR: path.join(ROOT, "share", "cache"),
    AGENT_CONTROL_USAGE_API: "off",
  };
}
