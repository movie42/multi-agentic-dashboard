import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3197);
export const ROOT = path.resolve(process.cwd(), "e2e", ".tmp");
export const ORCA_DIR = path.join(ROOT, "orca");
export const WORKTREE = path.join(ROOT, "worktree");
export const PANE_KEY = "aaaaaaaa-0000-4000-8000-000000000001:bbbbbbbb-0000-4000-8000-000000000001";
export const TERMINAL = "term_e2e";
export const CALLS = path.join(ORCA_DIR, "calls.jsonl");

const [tabId, leafId] = PANE_KEY.split(":");

export function prepareFixtures(): void {
  rmSync(ROOT, { recursive: true, force: true });
  for (const dir of [ORCA_DIR, WORKTREE, path.join(ROOT, "projects"), path.join(ROOT, "sessions"), path.join(ROOT, "share")]) {
    mkdirSync(dir, { recursive: true });
  }
  execFileSync("git", ["init", "-q", "-b", "main", WORKTREE]);
  writeFileSync(CALLS, "");
  const now = Date.now();
  writeFileSync(
    path.join(ORCA_DIR, "worktree-ps.json"),
    JSON.stringify({
      worktrees: [
        {
          worktreeId: "repo-1::wt",
          repoId: "repo-1",
          repo: "e2e-repo",
          path: WORKTREE,
          branch: "refs/heads/main",
          displayName: "e2e-worktree",
          isArchived: false,
          isMainWorktree: true,
          isPinned: false,
          parentWorktreeId: null,
          unread: false,
          status: "waiting",
          lastActivityAt: now,
          lastOutputAt: now,
          agents: [
            {
              paneKey: PANE_KEY,
              parentPaneKey: null,
              state: "waiting",
              agentType: "claude",
              prompt: "E2E 고정 프롬프트",
              taskTitle: null,
              displayName: null,
              lastAssistantMessage: "E2E 마지막 답변",
              toolName: null,
              interrupted: false,
              stateStartedAt: now - 60_000,
              updatedAt: now,
              hasLivePty: true,
            },
          ],
        },
      ],
    }),
  );
  writeFileSync(
    path.join(ORCA_DIR, "terminal-list.json"),
    JSON.stringify({
      terminals: [{ handle: TERMINAL, tabId, leafId, worktreeId: "repo-1::wt", title: "claude", connected: true }],
    }),
  );
}

export function serverEnv(): Record<string, string> {
  return {
    ORCA_BIN: path.resolve(process.cwd(), "e2e", "fake-orca.mjs"),
    FAKE_ORCA_DIR: ORCA_DIR,
    CLAUDE_PROJECTS_DIR: path.join(ROOT, "projects"),
    CLAUDE_SESSIONS_DIR: path.join(ROOT, "sessions"),
    AGENT_CONTROL_ASK_FILE: path.join(ROOT, "share", "ask-threads.json"),
    SB_FILE: path.join(ROOT, "share", "bookmarks.jsonl"),
    INTENT_DIFF_ARCHIVE_DIR: path.join(ROOT, "share", "intent-diff"),
    CURSOR_SETTINGS_FILE: path.join(ROOT, "share", "cursor-settings.json"),
  };
}
