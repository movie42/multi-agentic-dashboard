import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppBuildInfo, BranchStatus, DaemonInfo, DaemonSide } from "@/common/appStatus/types";
import { isMissingPath, nodeExecFile, type ExecFileFn } from "@/server/shared/ports";

const MAIN_BRANCHES = ["main", "master"];
const DAEMON_TIMEOUT_MS = 1500;

export function agentControlRepo(): string {
  const entry = process.env.RUNNER_DAEMON_ENTRY;
  return entry ? path.dirname(path.dirname(entry)) : process.cwd();
}

async function git(exec: ExecFileFn, cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", args, { cwd, timeout: 10_000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function mainCommitOf(exec: ExecFileFn, cwd: string): Promise<string | null> {
  for (const name of MAIN_BRANCHES) {
    const commit = await git(exec, cwd, ["rev-parse", "--verify", "-q", `refs/heads/${name}`]);
    if (commit) return commit;
  }
  return null;
}

export async function readBranchStatus(worktreePath: string, exec: ExecFileFn = nodeExecFile): Promise<BranchStatus> {
  const [branch, commit, mainCommit] = await Promise.all([
    git(exec, worktreePath, ["symbolic-ref", "--short", "-q", "HEAD"]),
    git(exec, worktreePath, ["rev-parse", "HEAD"]),
    mainCommitOf(exec, worktreePath),
  ]);
  const count = mainCommit && commit ? await git(exec, worktreePath, ["rev-list", "--count", `HEAD..${mainCommit}`]) : null;
  const behind = count === null ? null : Number.parseInt(count, 10);
  return { path: worktreePath, branch, commit, mainCommit, behind: Number.isFinite(behind) ? behind : null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildInfoOf(value: unknown): AppBuildInfo | null {
  if (!isRecord(value) || typeof value.commit !== "string" || typeof value.builtAt !== "number") return null;
  return { commit: value.commit, branch: typeof value.branch === "string" ? value.branch : null, builtAt: value.builtAt };
}

export async function readBuildInfo(file = path.join(process.cwd(), "build-info.json")): Promise<AppBuildInfo | null> {
  try {
    return buildInfoOf(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (!isMissingPath(error)) console.warn("[app-status] build-info.json unreadable", error);
    return null;
  }
}

export function daemonInfoOf(value: unknown): DaemonInfo | null {
  const info = isRecord(value) && isRecord(value.info) ? value.info : null;
  if (!info || typeof info.pid !== "number") return null;
  return {
    commit: typeof info.commit === "string" ? info.commit : null,
    pid: info.pid,
    startedAt: typeof info.startedAt === "number" ? info.startedAt : 0,
  };
}

export async function readDaemonSide(baseUrl: string, fetcher: typeof fetch = fetch): Promise<DaemonSide> {
  try {
    const response = await fetcher(`${baseUrl}/info`, { signal: AbortSignal.timeout(DAEMON_TIMEOUT_MS) });
    if (response.status === 404) return { kind: "running", commit: null, startedAt: null };
    const info = daemonInfoOf(await response.json());
    return info ? { kind: "running", commit: info.commit, startedAt: info.startedAt || null } : { kind: "running", commit: null, startedAt: null };
  } catch {
    return { kind: "down" };
  }
}
