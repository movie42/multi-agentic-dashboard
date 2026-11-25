"use client";

import type { ProjectSummary } from "@/common/board/types";
import type { WorkflowMode } from "@/common/workflow/types";
import { useState } from "react";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import type { WorkspacePage, WorkspaceScope } from "./workspaceWindow";

const SESSIONS_PAGE = "@sessions";
const DIFF_PAGE = "@diff";
const TODO_PAGE = "@todo";
const PAGES: ReadonlySet<string> = new Set([SESSIONS_PAGE, DIFF_PAGE, TODO_PAGE]);
const PAGE_SELECTION: Record<WorkspacePage, string[]> = { sessions: [SESSIONS_PAGE], todo: [TODO_PAGE], diff: [DIFF_PAGE] };

function initialSelection(scope: WorkspaceScope | null): string[] {
  if (!scope) return [];
  if (scope.kind === "page") return PAGE_SELECTION[scope.page];
  return [scope.repo, ...(scope.worktreeId ? [scope.worktreeId] : [])];
}

export interface WorkspacePrefs {
  selectedRepo: string | null;
  /** Only meaningful together with selectedRepo; may name a worktree that no longer exists. */
  selectedWorktreeId: string | null;
  showingSessions: boolean;
  showingDiff: boolean;
  showingTodo: boolean;
  openSessions: () => void;
  openDiff: () => void;
  openTodo: () => void;
  selectRepo: (repo: string | null) => void;
  selectWorktree: (repo: string, worktreeId: string) => void;
  modeOf: (project: ProjectSummary) => WorkflowMode;
  isModeOverridden: (repo: string) => boolean;
  toggleMode: (project: ProjectSummary) => void;
}

/**
 * With a scope (a window opened by "새 창에서 열기") the selection lives in this window only, so it
 * neither moves the other windows nor follows them.
 */
export function useWorkspacePrefs(scope: WorkspaceScope | null = null): WorkspacePrefs {
  const [stored, writeStored] = useStoredList("agent-control:selected-repo");
  const [local, writeLocal] = useState<string[]>(() => initialSelection(scope));
  const selected = scope ? local : stored;
  const writeSelected = scope ? writeLocal : writeStored;
  const [overrides, writeOverrides] = useStoredList("agent-control:mode-overrides");

  const overrideOf = (repo: string): WorkflowMode | null => {
    const entry = overrides.find((item) => item.startsWith(`${repo}=`));
    const value = entry?.slice(repo.length + 1);
    return value === "company" || value === "personal" ? value : null;
  };

  const modeOf = (project: ProjectSummary) => overrideOf(project.repo) ?? project.autoMode;

  return {
    selectedRepo: selected[0] && !PAGES.has(selected[0]) ? selected[0] : null,
    selectedWorktreeId: selected[0] && !PAGES.has(selected[0]) ? (selected[1] ?? null) : null,
    showingSessions: selected[0] === SESSIONS_PAGE,
    showingDiff: selected[0] === DIFF_PAGE,
    showingTodo: selected[0] === TODO_PAGE,
    openSessions: () => writeSelected([SESSIONS_PAGE]),
    openDiff: () => writeSelected([DIFF_PAGE]),
    openTodo: () => writeSelected([TODO_PAGE]),
    selectRepo: (repo) => writeSelected(repo ? [repo] : []),
    selectWorktree: (repo, worktreeId) => writeSelected([repo, worktreeId]),
    modeOf,
    isModeOverridden: (repo) => overrideOf(repo) !== null,
    toggleMode: (project) => {
      const next: WorkflowMode = modeOf(project) === "company" ? "personal" : "company";
      const rest = overrides.filter((item) => !item.startsWith(`${project.repo}=`));
      writeOverrides(next === project.autoMode ? rest : [...rest, `${project.repo}=${next}`]);
    },
  };
}
