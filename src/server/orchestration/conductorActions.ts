import "server-only";
import type { WorktreeSummary } from "@/common/board/types";
import type { ConductorScopeKind, GrantBundle } from "@/common/orchestration/types";
import type { RunnerLaunchRequest, RunnerSession } from "@/common/runner/types";
import type { CreatedWorktree, CreateWorktreeInput } from "@/server/projects/WorktreeActions";
import { conductorScope, worktreeNameFor } from "./conductorScope";

export interface ConductorActionDeps {
  worktrees: () => Promise<WorktreeSummary[]>;
  runner: {
    list(): Promise<RunnerSession[]>;
    launch(request: RunnerLaunchRequest): Promise<RunnerSession>;
    settleWorktreeRequest(conductorId: string, requestId: string, result: { path?: string; error?: string }): Promise<void>;
  };
  createWorktree: (input: CreateWorktreeInput) => Promise<CreatedWorktree>;
}

export interface LaunchConductorInput {
  worktreePath: string;
  prompt: string;
  scope: ConductorScopeKind;
  grants: GrantBundle[];
}

export async function launchConductor(deps: ConductorActionDeps, input: LaunchConductorInput): Promise<RunnerSession> {
  const scope = conductorScope(await deps.worktrees(), input.scope, input.worktreePath);
  if (!scope) throw new Error("보드에서 이 워크트리를 찾지 못했어요");
  const prompt = input.prompt.trim();
  return deps.runner.launch({ cwd: input.worktreePath, ...(prompt ? { prompt } : {}), conductor: { scope, grants: input.grants } });
}

export async function answerWorktreeRequest(deps: ConductorActionDeps, conductorId: string, requestId: string, approve: boolean): Promise<void> {
  const conductor = (await deps.runner.list()).find((session) => session.id === conductorId);
  const settings = conductor?.orchestration?.conductor;
  const request = settings?.worktreeRequest;
  if (!conductor || !settings || !request || request.id !== requestId) throw new Error("이미 처리한 워크트리 요청이에요");
  if (!approve) {
    await deps.runner.settleWorktreeRequest(conductorId, requestId, {});
    return;
  }
  const worktrees = await deps.worktrees();
  const home = worktrees
    .filter((worktree) => conductor.cwd === worktree.path || conductor.cwd.startsWith(`${worktree.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!home) {
    await deps.runner.settleWorktreeRequest(conductorId, requestId, { error: "지휘자의 워크트리를 보드에서 찾지 못했어요" });
    throw new Error("지휘자의 워크트리를 보드에서 찾지 못했어요");
  }
  try {
    const created = await deps.createWorktree({
      projectPath: home.projectPath,
      name: worktreeNameFor(request.branch),
      branch: request.branch,
      baseBranch: request.base ?? home.branch ?? "main",
      parentPath: settings.scope.kind === "worktree" ? settings.scope.root : null,
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

export class ConductorActions {
  constructor(private readonly deps: ConductorActionDeps) {}

  launch(input: LaunchConductorInput): Promise<RunnerSession> {
    return launchConductor(this.deps, input);
  }

  answerWorktreeRequest(conductorId: string, requestId: string, approve: boolean): Promise<void> {
    return answerWorktreeRequest(this.deps, conductorId, requestId, approve);
  }
}
