import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppBuildInfo, AppBuildJob, AppBuildPhase, BranchStatus, DaemonInfo, DaemonSide } from "@/common/appStatus/types";
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

const startupBuild: { info: Promise<AppBuildInfo | null> | null } = { info: null };

// The installer replaces the bundle under a running server, so build-info.json on disk can be newer
// than the code this process runs. The first read stands for the running build.
export function readRunningBuildInfo(): Promise<AppBuildInfo | null> {
  startupBuild.info ??= readBuildInfo();
  return startupBuild.info;
}

const BUILD_PHASES: readonly AppBuildPhase[] = ["building", "installing", "relaunching"];

function isPhase(value: unknown): value is AppBuildPhase {
  return BUILD_PHASES.some((phase) => phase === value);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

// The button writes a record without a pid before the shell starts the script; give the shell this
// long to replace it before calling the job stopped.
const QUEUED_GRACE_MS = 30_000;

// Reads what scripts/apply-app.mjs records; a job whose process is gone without a result was cut off.
export function buildJobOf(value: unknown, isAlive: (pid: number) => boolean = processAlive, now = Date.now()): AppBuildJob {
  if (!isRecord(value) || !isPhase(value.phase) || typeof value.startedAt !== "number") return { kind: "none" };
  const commit = typeof value.commit === "string" ? value.commit : null;
  const finishedAt = typeof value.finishedAt === "number" ? value.finishedAt : value.startedAt;
  if (value.result === "done") return { kind: "done", commit, finishedAt };
  if (value.result === "failed") {
    const message = typeof value.message === "string" ? value.message : "알 수 없는 오류";
    return { kind: "failed", phase: value.phase, commit, message, finishedAt };
  }
  const alive = typeof value.pid === "number" ? isAlive(value.pid) : now - value.startedAt < QUEUED_GRACE_MS;
  return { kind: alive ? "running" : "stopped", phase: value.phase, commit, startedAt: value.startedAt };
}

export function buildJobFile(repoPath: string): string {
  return path.join(repoPath, "dist", "app-build.json");
}

export async function queueBuildJob(repoPath: string): Promise<void> {
  const file = buildJobFile(repoPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ phase: "building", startedAt: Date.now() }, null, 2));
}

export async function readBuildJob(repoPath: string): Promise<AppBuildJob> {
  try {
    return buildJobOf(JSON.parse(await readFile(buildJobFile(repoPath), "utf8")));
  } catch (error) {
    if (!isMissingPath(error)) console.warn("[app-status] app-build.json unreadable", error);
    return { kind: "none" };
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
