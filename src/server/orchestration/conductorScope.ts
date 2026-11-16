import type { WorktreeSummary } from "@/common/board/types";
import type { ConductorScope, ConductorScopeKind } from "@/common/orchestration/types";

type ScopeWorktree = Pick<WorktreeSummary, "path" | "projectPath" | "parentWorktreeId" | "branch">;

/**
 * Folders a conductor may open sessions in: every worktree of the project for a project conductor,
 * or the worktree plus the worktrees split off from it (transitively) for a worktree conductor.
 */
export function conductorScope(worktrees: readonly ScopeWorktree[], kind: ConductorScopeKind, worktreePath: string): ConductorScope | null {
  const origin = worktrees.find((worktree) => worktree.path === worktreePath);
  if (!origin) return null;
  if (kind === "project") {
    const paths = worktrees.filter((worktree) => worktree.projectPath === origin.projectPath).map((worktree) => worktree.path);
    return { kind, root: origin.projectPath, paths };
  }
  const descendants = (parent: string, seen: ReadonlySet<string>): string[] =>
    worktrees
      .filter((worktree) => worktree.parentWorktreeId === parent && !seen.has(worktree.path))
      .flatMap((worktree) => [worktree.path, ...descendants(worktree.path, new Set([...seen, worktree.path]))]);
  return { kind, root: origin.path, paths: [origin.path, ...descendants(origin.path, new Set([origin.path]))] };
}

export function worktreeNameFor(branch: string): string {
  return branch.replace(/^.*\//, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "worktree";
}
