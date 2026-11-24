import { openWindow } from "@/client/shared/lib/openWindow";

/** The project, and optionally the worktree, a board window opened with "새 창에서 열기" stays on. */
export interface WorkspaceScope {
  repo: string;
  worktreeId: string | null;
}

export function workspaceWindowHref(repo: string, worktreeId?: string): string {
  const params = new URLSearchParams({ repo });
  if (worktreeId) params.set("worktree", worktreeId);
  return `/?${params.toString()}`;
}

export function workspaceScopeOf(params: Pick<URLSearchParams, "get">): WorkspaceScope | null {
  const repo = params.get("repo");
  return repo ? { repo, worktreeId: params.get("worktree") } : null;
}

export function openWorkspaceWindow(repo: string, worktreeId?: string): void {
  openWindow(workspaceWindowHref(repo, worktreeId), { width: 1440, height: 960 }, `board:${repo}:${worktreeId ?? ""}`);
}
