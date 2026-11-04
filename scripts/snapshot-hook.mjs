#!/usr/bin/env node
// Claude Code PostToolUse hook. After a tool call that can change files, it stores the working
// tree as a git tree object (through a private index, so the user's staging area is untouched)
// and appends one line to <git dir>/agent-snapshots.jsonl when the tree differs from the last
// line. Two consecutive lines give exactly what one tool call changed, shell commands included.
// It never blocks the agent: every failure exits 0 without output.
import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, copyFileSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import path from "node:path";

const TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"]);
const LOG_NAME = "agent-snapshots.jsonl";
const INDEX_NAME = "agent-snapshot.index";
const TAIL_BYTES = 4096;

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function git(cwd, args, env) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 8000,
  }).trim();
}

function lastTree(log) {
  if (!existsSync(log)) return null;
  const size = statSync(log).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(log, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString("utf8").trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]).tree ?? null;
  } catch {
    return null;
  }
}

function main() {
  const input = readStdin();
  if (!input || !TOOLS.has(input.tool_name) || typeof input.cwd !== "string") return;
  const [top, gitDir] = git(input.cwd, ["rev-parse", "--show-toplevel", "--absolute-git-dir"]).split("\n");
  if (!top || !gitDir) return;
  const index = path.join(gitDir, INDEX_NAME);
  const realIndex = path.join(gitDir, "index");
  if (!existsSync(index) && existsSync(realIndex)) copyFileSync(realIndex, index);
  const env = { GIT_INDEX_FILE: index };
  git(top, ["add", "-A"], env);
  const tree = git(top, ["write-tree"], env);
  const log = path.join(gitDir, LOG_NAME);
  if (!tree || lastTree(log) === tree) return;
  const record = {
    at: Date.now(),
    sessionId: input.session_id ?? null,
    toolUseId: input.tool_use_id ?? null,
    tool: input.tool_name,
    tree,
  };
  appendFileSync(log, `${JSON.stringify(record)}\n`);
}

try {
  main();
} catch {}
process.exit(0);
