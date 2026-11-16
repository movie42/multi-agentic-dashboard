import { queryOptions } from "@tanstack/react-query";
import type { ProjectOverlapsResponse, WorktreeOverlap } from "@/common/projectOverview/types";
import { readJson } from "@/client/shared/api/json";

const OVERLAP_POLL_MS = 30_000;

export const projectOverviewKeys = {
  all: ["project-overview"] as const,
  overlaps: (projectPath: string) => [...projectOverviewKeys.all, "overlaps", projectPath] as const,
};

async function fetchOverlaps(projectPath: string, signal: AbortSignal): Promise<WorktreeOverlap[]> {
  const response = await fetch(`/api/project-overlaps?${new URLSearchParams({ project: projectPath }).toString()}`, { signal, cache: "no-store" });
  const body = await readJson<ProjectOverlapsResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.overlaps;
}

export function overlapsQueryOptions(projectPath: string) {
  return queryOptions({
    queryKey: projectOverviewKeys.overlaps(projectPath),
    queryFn: ({ signal }) => fetchOverlaps(projectPath, signal),
    refetchInterval: OVERLAP_POLL_MS,
    retry: false,
  });
}
