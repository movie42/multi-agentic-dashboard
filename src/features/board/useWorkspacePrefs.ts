"use client";

import type { ProjectSummary } from "@/lib/orca/types";
import type { WorkflowMode } from "@/lib/workflow/types";
import { useStoredList } from "./useStoredList";

const SESSIONS_PAGE = "@sessions";
const DIFF_PAGE = "@diff";
const PAGES = new Set([SESSIONS_PAGE, DIFF_PAGE]);

export interface WorkspacePrefs {
  selectedRepo: string | null;
  showingSessions: boolean;
  showingDiff: boolean;
  openSessions: () => void;
  openDiff: () => void;
  selectRepo: (repo: string | null) => void;
  modeOf: (project: ProjectSummary) => WorkflowMode;
  isModeOverridden: (repo: string) => boolean;
  toggleMode: (project: ProjectSummary) => void;
}

export function useWorkspacePrefs(): WorkspacePrefs {
  const [selected, writeSelected] = useStoredList("agent-control:selected-repo");
  const [overrides, writeOverrides] = useStoredList("agent-control:mode-overrides");

  const overrideOf = (repo: string): WorkflowMode | null => {
    const entry = overrides.find((item) => item.startsWith(`${repo}=`));
    const value = entry?.slice(repo.length + 1);
    return value === "company" || value === "personal" ? value : null;
  };

  const modeOf = (project: ProjectSummary) => overrideOf(project.repo) ?? project.autoMode;

  return {
    selectedRepo: selected[0] && !PAGES.has(selected[0]) ? selected[0] : null,
    showingSessions: selected[0] === SESSIONS_PAGE,
    showingDiff: selected[0] === DIFF_PAGE,
    openSessions: () => writeSelected([SESSIONS_PAGE]),
    openDiff: () => writeSelected([DIFF_PAGE]),
    selectRepo: (repo) => writeSelected(repo ? [repo] : []),
    modeOf,
    isModeOverridden: (repo) => overrideOf(repo) !== null,
    toggleMode: (project) => {
      const next: WorkflowMode = modeOf(project) === "company" ? "personal" : "company";
      const rest = overrides.filter((item) => !item.startsWith(`${project.repo}=`));
      writeOverrides(next === project.autoMode ? rest : [...rest, `${project.repo}=${next}`]);
    },
  };
}
