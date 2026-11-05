import "server-only";
import path from "node:path";
import { LRUCache } from "lru-cache";
import type { PullRequestInfo, WorkflowMode } from "@/common/workflow/types";
import { errorField, isMissingPath, type ExecFileFn, type FileSystemPort, type ReportFn } from "@/server/shared/ports";
import {
  isMissingRemote,
  isPullRequestNotApplicable,
  isSharedBranch,
  modeOf,
  ownerFromRemoteUrl,
  parsePullRequestList,
} from "./github";

interface PullRequestContext {
  worktreePath: string;
  branch: string;
}

export interface GitInfoOptions {
  execFile: ExecFileFn;
  fs: FileSystemPort;
  warn: ReportFn;
  prTtlMs?: number;
}

export const PR_TTL_MS = 60_000;

export class GitInfo {
  private readonly execFile: ExecFileFn;
  private readonly fs: FileSystemPort;
  private readonly warn: ReportFn;
  private readonly pullRequests: LRUCache<string, PullRequestInfo, PullRequestContext>;
  private readonly modes = new LRUCache<string, WorkflowMode>({ max: 200 });
  private readonly gitConfigs = new LRUCache<string, { file: string | null }>({ max: 200 });
  private login: Promise<string | null> | null = null;

  constructor(options: GitInfoOptions) {
    this.execFile = options.execFile;
    this.fs = options.fs;
    this.warn = options.warn;
    this.pullRequests = new LRUCache<string, PullRequestInfo, PullRequestContext>({
      max: 500,
      ttl: options.prTtlMs ?? PR_TTL_MS,
      allowStale: true,
      noDeleteOnStaleGet: true,
      fetchMethod: (_key, _stale, { context }) => this.fetchPullRequest(context.worktreePath, context.branch),
    });
  }

  getPullRequest(worktreePath: string, branch: string | null): PullRequestInfo {
    if (!branch || isSharedBranch(branch)) return { kind: "not-applicable" };
    const key = `${worktreePath}\0${branch}`;
    this.pullRequests.fetch(key, { context: { worktreePath, branch } }).catch((error: unknown) => {
      this.warn("pr", error, { worktreePath, branch });
    });
    return this.pullRequests.get(key) ?? { kind: "loading" };
  }

  async detectMode(repoPath: string): Promise<WorkflowMode> {
    const key = `${repoPath}\0${await this.configVersion(repoPath)}`;
    const cached = this.modes.get(key);
    if (cached) return cached;
    const [owner, login] = await Promise.all([this.remoteOwner(repoPath), this.githubLogin()]);
    const mode = modeOf(owner, login);
    if (owner === null || login !== null) this.modes.set(key, mode);
    return mode;
  }

  private githubLogin(): Promise<string | null> {
    this.login ??= this.execFile("gh", ["api", "user", "-q", ".login"], { timeout: 10_000 }).then(
      ({ stdout }) => stdout.trim() || null,
      (error: unknown) => {
        this.warn("git", error, { step: "gh api user" });
        this.login = null;
        return null;
      },
    );
    return this.login;
  }

  private async configVersion(repoPath: string): Promise<string> {
    const { file } = await this.gitConfigFile(repoPath);
    if (!file) return "none";
    return this.fs.stat(file).then(
      (info) => String(info.mtimeMs),
      (error: unknown) => {
        if (!isMissingPath(error)) this.warn("git", error, { file });
        return "missing";
      },
    );
  }

  private async gitConfigFile(repoPath: string): Promise<{ file: string | null }> {
    const cached = this.gitConfigs.get(repoPath);
    if (cached) return cached;
    const entry = await this.execFile("git", ["-C", repoPath, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      timeout: 5_000,
    }).then(
      ({ stdout }) => ({ file: path.join(stdout.trim(), "config") }),
      (error: unknown) => {
        if (!isMissingRemote(errorField(error, "stderr"))) this.warn("git", error, { repoPath, step: "git-common-dir" });
        return { file: null };
      },
    );
    this.gitConfigs.set(repoPath, entry);
    return entry;
  }

  private async remoteOwner(repoPath: string): Promise<string | null> {
    return this.execFile("git", ["-C", repoPath, "remote", "get-url", "origin"], { timeout: 5_000 }).then(
      ({ stdout }) => ownerFromRemoteUrl(stdout),
      (error: unknown) => {
        if (!isMissingRemote(errorField(error, "stderr"))) this.warn("git", error, { repoPath, step: "remote get-url" });
        return null;
      },
    );
  }

  private async fetchPullRequest(worktreePath: string, branch: string): Promise<PullRequestInfo> {
    try {
      const { stdout } = await this.execFile(
        "gh",
        ["pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number,state,isDraft,url"],
        { cwd: worktreePath, timeout: 15_000 },
      );
      return parsePullRequestList(stdout);
    } catch (error) {
      const stderr = errorField(error, "stderr");
      if (isPullRequestNotApplicable(stderr)) return { kind: "not-applicable" };
      this.warn("pr", error, { worktreePath, branch, stderr: stderr.trim() });
      return { kind: "unknown" };
    }
  }
}
