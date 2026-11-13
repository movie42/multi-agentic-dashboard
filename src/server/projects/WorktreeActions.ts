import "server-only";
import path from "node:path";
import type { RunnerLaunchRequest, RunnerSession } from "@/common/runner/types";
import { errorField, type ExecFileFn, type ReportFn } from "@/server/shared/ports";
import type { GitWorktree } from "./gitWorktrees";
import type { Project } from "./ProjectRegistry";
import type { WorktreeMeta } from "./WorktreeMeta";

const CREATE_TIMEOUT_MS = 120_000;
const REMOVE_TIMEOUT_MS = 60_000;

export interface CreateWorktreeInput {
  projectPath: string;
  name: string;
  branch: string;
  baseBranch: string;
  parentPath: string | null;
  reference: string | null;
  prompt: string;
}

export interface CreatedWorktree {
  path: string;
  name: string;
  launchError?: string;
}

export interface WorktreeActionsOptions {
  execFile: ExecFileFn;
  projects: () => Promise<Project[]>;
  worktreesOf: (project: Project) => Promise<GitWorktree[]>;
  meta: Pick<WorktreeMeta, "patch" | "remove">;
  runner: {
    list(): Promise<RunnerSession[]>;
    launch(request: RunnerLaunchRequest): Promise<RunnerSession>;
    close(id: string): Promise<void>;
  };
  warn: ReportFn;
}

export function worktreePathFor(projectPath: string, name: string): string {
  return path.join(path.dirname(projectPath), `${path.basename(projectPath)}-${name}`);
}

function gitMessage(error: unknown): string {
  const stderr = errorField(error, "stderr").trim().split("\n").pop();
  return stderr || (error instanceof Error ? error.message : String(error));
}

export class WorktreeActions {
  constructor(private readonly options: WorktreeActionsOptions) {}

  async create(input: CreateWorktreeInput): Promise<CreatedWorktree> {
    const { execFile, meta, runner } = this.options;
    const project = (await this.options.projects()).find((candidate) => candidate.path === input.projectPath);
    if (!project) throw new Error("프로젝트를 찾지 못했어요");
    if (project.kind !== "git") throw new Error("git 저장소가 아닌 폴더에는 워크트리를 만들 수 없어요");
    const target = worktreePathFor(project.path, input.name);
    const base = await this.resolveBase(project.path, input.baseBranch);
    await execFile("git", ["-C", project.path, "worktree", "add", "--no-track", "-b", input.branch, target, base], {
      timeout: CREATE_TIMEOUT_MS,
    }).catch((error: unknown) => {
      throw new Error(gitMessage(error));
    });
    await meta.patch(target, {
      displayName: input.name,
      parentPath: input.parentPath ?? undefined,
      reference: input.reference ?? undefined,
    });
    const prompt = input.prompt.trim();
    if (!prompt) return { path: target, name: input.name };
    try {
      await runner.launch({ cwd: target, prompt });
      return { path: target, name: input.name };
    } catch (error) {
      this.options.warn("worktrees", error, { step: "launch first prompt", worktreePath: target });
      return { path: target, name: input.name, launchError: error instanceof Error ? error.message : String(error) };
    }
  }

  async remove(worktreePath: string, force: boolean): Promise<void> {
    const { execFile, meta, runner, warn } = this.options;
    const found = await this.locate(worktreePath);
    if (!found) throw new Error("워크트리를 찾지 못했어요");
    if (found.worktree.isMain) throw new Error("프로젝트의 원래 폴더는 지울 수 없어요");
    await execFile("git", ["-C", found.project.path, "worktree", "remove", ...(force ? ["--force"] : []), worktreePath], {
      timeout: REMOVE_TIMEOUT_MS,
    }).catch((error: unknown) => {
      throw new Error(gitMessage(error));
    });
    await meta.remove(worktreePath);
    const sessions = await runner.list().catch((error: unknown) => {
      warn("worktrees", error, { step: "list sessions after remove" });
      return [];
    });
    const inside = sessions.filter((session) => session.cwd === worktreePath || session.cwd.startsWith(`${worktreePath}/`));
    await Promise.all(
      inside.map((session) =>
        runner.close(session.id).catch((error: unknown) => warn("worktrees", error, { step: "close session", sessionId: session.id })),
      ),
    );
  }

  async rename(worktreePath: string, name: string): Promise<void> {
    await this.options.meta.patch(worktreePath, { displayName: name.trim() });
  }

  private async resolveBase(projectPath: string, baseBranch: string): Promise<string> {
    const exists = (ref: string) =>
      this.options.execFile("git", ["-C", projectPath, "rev-parse", "--verify", "--quiet", ref], { timeout: 10_000 }).then(
        () => true,
        () => false,
      );
    if (await exists(`refs/heads/${baseBranch}`)) return baseBranch;
    if (await exists(`refs/remotes/origin/${baseBranch}`)) return `origin/${baseBranch}`;
    return baseBranch;
  }

  private async locate(worktreePath: string): Promise<{ project: Project; worktree: GitWorktree } | null> {
    const projects = await this.options.projects();
    const listed = await Promise.all(
      projects.map(async (project) => ({ project, worktree: (await this.options.worktreesOf(project)).find((entry) => entry.path === worktreePath) })),
    );
    const hit = listed.find((entry) => entry.worktree);
    return hit?.worktree ? { project: hit.project, worktree: hit.worktree } : null;
  }
}
