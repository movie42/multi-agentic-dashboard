import { services } from "@/server/container";
import type { PullRequestInfo, WorkflowMode } from "./types";

export function detectMode(repoPath: string): Promise<WorkflowMode> {
  return services().workflow.git.detectMode(repoPath);
}

export function getPullRequest(worktreePath: string, branch: string | null): PullRequestInfo {
  return services().workflow.git.getPullRequest(worktreePath, branch);
}
