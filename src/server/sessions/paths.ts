import "server-only";
import { homedir } from "node:os";
import path from "node:path";

export const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
export const LIVE_SESSIONS_DIR = process.env.CLAUDE_SESSIONS_DIR ?? path.join(homedir(), ".claude", "sessions");
export const SESSION_CACHE_FILE = path.join(
  process.env.AGENT_CONTROL_CACHE_DIR ?? path.join(process.cwd(), ".next", "cache", "agent-control"),
  "claude-sessions.json",
);
export const BOOKMARK_FILE =
  process.env.SB_FILE ?? path.join(homedir(), ".local", "share", "session-bookmark", "bookmarks.jsonl");

export function projectDirOf(projectsDir: string, cwd: string): string {
  return path.join(projectsDir, cwd.replace(/[^A-Za-z0-9]/g, "-"));
}
