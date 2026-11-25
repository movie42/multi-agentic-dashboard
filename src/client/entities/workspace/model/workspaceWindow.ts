import { openWindow } from "@/client/shared/lib/openWindow";

/** A sidebar page that opens as a window of its own, showing only that page: past sessions, todos or changes. */
export type WorkspacePage = "sessions" | "todo" | "diff";

const PAGES: readonly WorkspacePage[] = ["sessions", "todo", "diff"];

/** What a board window opened with "새 창에서 열기" shows: a project it can move away from, or one page. */
export type WorkspaceScope = { kind: "project"; repo: string; worktreeId: string | null } | { kind: "page"; page: WorkspacePage };

const BOARD_WINDOW = { width: 1440, height: 960 };

export function workspaceWindowHref(repo: string, worktreeId?: string): string {
  const params = new URLSearchParams({ repo });
  if (worktreeId) params.set("worktree", worktreeId);
  return `/?${params.toString()}`;
}

export function pageWindowHref(page: WorkspacePage): string {
  return `/?${new URLSearchParams({ page }).toString()}`;
}

export function workspaceScopeOf(params: Pick<URLSearchParams, "get">): WorkspaceScope | null {
  const repo = params.get("repo");
  if (repo) return { kind: "project", repo, worktreeId: params.get("worktree") };
  const page = PAGES.find((each) => each === params.get("page"));
  return page ? { kind: "page", page } : null;
}

export function openWorkspaceWindow(repo: string, worktreeId?: string): void {
  openWindow(workspaceWindowHref(repo, worktreeId), BOARD_WINDOW, `board:${repo}:${worktreeId ?? ""}`);
}

export function openPageWindow(page: WorkspacePage): void {
  openWindow(pageWindowHref(page), BOARD_WINDOW, `page:${page}`);
}
