import "server-only";
import type { WorktreeSummary } from "@/common/board/types";
import type { ConductorScopeKind, GrantBundle } from "@/common/orchestration/types";
import type { RunnerLaunchRequest, RunnerSession } from "@/common/runner/types";
import type { CreatedWorktree, CreateWorktreeInput } from "@/server/projects/WorktreeActions";
import { boardProjects, conductorScope, projectOfFolder, worktreeNameFor } from "./conductorScope";

type SettleResult = { path?: string; error?: string };

export interface ConductorActionDeps {
  worktrees: () => Promise<WorktreeSummary[]>;
  runner: {
    list(): Promise<RunnerSession[]>;
    launch(request: RunnerLaunchRequest): Promise<RunnerSession>;
    settleWorktreeRequest(conductorId: string, requestId: string, result: SettleResult): Promise<void>;
    settleProjectRequest(conductorId: string, requestId: string, result: SettleResult): Promise<void>;
  };
  createWorktree: (input: CreateWorktreeInput) => Promise<CreatedWorktree>;
}

export interface LaunchConductorInput {
  /** Null for a conductor opened outside any project. */
  worktreePath: string | null;
  prompt: string;
  scope: ConductorScopeKind;
  grants: GrantBundle[];
  /** Other project folders handed to it at the start. */
  projects: string[];
}

export async function launchConductor(deps: ConductorActionDeps, input: LaunchConductorInput): Promise<RunnerSession> {
  const worktrees = await deps.worktrees();
  const scope = conductorScope(worktrees, input.scope, input.worktreePath, input.projects);
  if (!scope) throw new Error("보드에서 이 워크트리를 찾지 못했어요");
  if (scope.kind === "app" && scope.projects.length === 0) throw new Error("맡길 프로젝트를 하나 이상 골라 주세요");
  const prompt = input.prompt.trim();
  return deps.runner.launch({
    // The daemon runs an app conductor in its own folder and ignores this cwd.
    cwd: input.worktreePath ?? scope.root,
    ...(prompt ? { prompt } : {}),
    conductor: { scope, grants: input.grants, knownProjects: boardProjects(worktrees) },
  });
}

async function pendingConductor(deps: ConductorActionDeps, conductorId: string) {
  const conductor = (await deps.runner.list()).find((session) => session.id === conductorId);
  const settings = conductor?.orchestration?.conductor;
  return conductor && settings ? { session: conductor, settings } : null;
}

export async function answerWorktreeRequest(deps: ConductorActionDeps, conductorId: string, requestId: string, approve: boolean): Promise<void> {
  const found = await pendingConductor(deps, conductorId);
  const request = found?.settings.worktreeRequest;
  if (!found || !request || request.id !== requestId) throw new Error("이미 처리한 워크트리 요청이에요");
  const { session, settings } = found;
  if (!approve) {
    await deps.runner.settleWorktreeRequest(conductorId, requestId, {});
    return;
  }
  const worktrees = await deps.worktrees();
  const home = worktrees
    .filter((worktree) => session.cwd === worktree.path || session.cwd.startsWith(`${worktree.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const projectPath = request.project ?? home?.projectPath ?? null;
  const main = worktrees.find((worktree) => worktree.projectPath === projectPath && worktree.isMain);
  const fail = async (message: string) => {
    await deps.runner.settleWorktreeRequest(conductorId, requestId, { error: message });
    throw new Error(message);
  };
  if (!projectPath) return fail("워크트리를 만들 프로젝트를 보드에서 찾지 못했어요");
  const sameProject = home?.projectPath === projectPath;
  try {
    const created = await deps.createWorktree({
      projectPath,
      name: worktreeNameFor(request.branch),
      branch: request.branch,
      baseBranch: request.base ?? (sameProject ? home?.branch : main?.branch) ?? "main",
      parentPath: settings.scope.kind === "worktree" && sameProject ? settings.scope.root : null,
      reference: null,
      prompt: "",
    });
    await deps.runner.settleWorktreeRequest(conductorId, requestId, { path: created.path });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.runner.settleWorktreeRequest(conductorId, requestId, { error: message });
    throw error;
  }
}

export async function answerProjectRequest(deps: ConductorActionDeps, conductorId: string, requestId: string, approve: boolean): Promise<void> {
  const found = await pendingConductor(deps, conductorId);
  const request = found?.settings.projectRequest;
  if (!found || !request || request.id !== requestId) throw new Error("이미 처리한 프로젝트 요청이에요");
  if (!approve) {
    await deps.runner.settleProjectRequest(conductorId, requestId, {});
    return;
  }
  const project = projectOfFolder(await deps.worktrees(), request.path);
  if (!project) {
    const message = "대시보드에 등록된 프로젝트가 아니에요. 먼저 프로젝트를 추가해 주세요";
    await deps.runner.settleProjectRequest(conductorId, requestId, { error: message });
    throw new Error(message);
  }
  await deps.runner.settleProjectRequest(conductorId, requestId, { path: project });
}

export class ConductorActions {
  constructor(private readonly deps: ConductorActionDeps) {}

  launch(input: LaunchConductorInput): Promise<RunnerSession> {
    return launchConductor(this.deps, input);
  }

  answerWorktreeRequest(conductorId: string, requestId: string, approve: boolean): Promise<void> {
    return answerWorktreeRequest(this.deps, conductorId, requestId, approve);
  }

  answerProjectRequest(conductorId: string, requestId: string, approve: boolean): Promise<void> {
    return answerProjectRequest(this.deps, conductorId, requestId, approve);
  }
}
