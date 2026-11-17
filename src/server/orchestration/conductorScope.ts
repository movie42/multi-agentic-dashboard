import type { WorktreeSummary } from "@/common/board/types";
import type { ConductorScope, ConductorScopeKind } from "@/common/orchestration/types";

type ScopeWorktree = Pick<WorktreeSummary, "path" | "projectPath" | "parentWorktreeId" | "branch">;

/** Root the daemon swaps for its own app conductor folder; the app does not know where that is. */
export const APP_CONDUCTOR_ROOT = "/";

/** Every project folder on the board, in board order. */
export function boardProjects(worktrees: readonly ScopeWorktree[]): string[] {
  return [...new Set(worktrees.map((worktree) => worktree.projectPath))];
}

/**
 * What a new conductor may reach. A project conductor gets its whole project, a worktree conductor its
 * worktree plus the worktrees split off from it (transitively), an app conductor nothing of its own;
 * each also gets the `extraProjects` a person handed it. Projects are kept as folders so worktrees made
 * later count too.
 */
export function conductorScope(
  worktrees: readonly ScopeWorktree[],
  kind: ConductorScopeKind,
  worktreePath: string | null,
  extraProjects: readonly string[] = [],
): ConductorScope | null {
  const known = new Set(boardProjects(worktrees));
  const extras = extraProjects.filter((project) => known.has(project));
  if (kind === "app") return { kind, root: APP_CONDUCTOR_ROOT, paths: [], projects: [...new Set(extras)] };
  const origin = worktrees.find((worktree) => worktree.path === worktreePath);
  if (!origin) return null;
  if (kind === "project") {
    return { kind, root: origin.projectPath, paths: [], projects: [...new Set([origin.projectPath, ...extras])] };
  }
  const descendants = (parent: string, seen: ReadonlySet<string>): string[] =>
    worktrees
      .filter((worktree) => worktree.parentWorktreeId === parent && !seen.has(worktree.path))
      .flatMap((worktree) => [worktree.path, ...descendants(worktree.path, new Set([...seen, worktree.path]))]);
  return {
    kind,
    root: origin.path,
    paths: [origin.path, ...descendants(origin.path, new Set([origin.path]))],
    projects: [...new Set(extras.filter((project) => project !== origin.projectPath))],
  };
}

/** The board project a folder belongs to: a project folder itself or one of its worktrees. */
export function projectOfFolder(worktrees: readonly ScopeWorktree[], folder: string): string | null {
  const trimmed = folder.replace(/\/+$/, "");
  const exact = worktrees.find((worktree) => worktree.projectPath === trimmed || worktree.path === trimmed);
  return exact?.projectPath ?? null;
}

export function worktreeNameFor(branch: string): string {
  return branch.replace(/^.*\//, "").replace(/[^\w.-]+/g, "-").slice(0, 60) || "worktree";
}
