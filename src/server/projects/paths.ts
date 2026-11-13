import "server-only";
import { homedir } from "node:os";
import path from "node:path";
import { RUNNER_USAGE_FILE } from "@/common/runner/types";

const DATA_DIR = process.env.AGENT_CONTROL_DATA_DIR ?? path.join(homedir(), ".local", "share", "agent-control");

export const PROJECTS_FILE = process.env.PROJECTS_FILE ?? path.join(DATA_DIR, "projects.json");
export const WORKTREE_META_FILE = process.env.WORKTREE_META_FILE ?? path.join(DATA_DIR, "worktrees.json");
export const USAGE_FILE = process.env.RUNNER_USAGE_FILE ?? path.join(DATA_DIR, RUNNER_USAGE_FILE);
export const ORCA_BIN = process.env.ORCA_BIN ?? "/Applications/Orca.app/Contents/Resources/bin/orca";
