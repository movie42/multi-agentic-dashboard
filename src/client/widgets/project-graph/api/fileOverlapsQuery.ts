import { queryOptions } from "@tanstack/react-query";
import type { FileOverlap, FileOverlapsResponse } from "@/common/projects/overlaps";
import { readJson } from "@/client/shared/api/json";

export const OVERLAP_POLL_MS = 30_000;

async function fetchOverlaps(paths: string[], signal: AbortSignal): Promise<FileOverlap[]> {
  const params = new URLSearchParams(paths.map((path) => ["path", path]));
  const response = await fetch(`/api/project-overlaps?${params.toString()}`, { signal, cache: "no-store" });
  const body = await readJson<FileOverlapsResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.overlaps;
}

/** Same-file overlaps between a project's worktrees; the main checkout is left out by the caller. */
export function fileOverlapsQueryOptions(paths: string[]) {
  return queryOptions({
    queryKey: ["project-overlaps", ...paths] as const,
    queryFn: ({ signal }) => fetchOverlaps(paths, signal),
    enabled: paths.length > 1,
    refetchInterval: OVERLAP_POLL_MS,
    retry: false,
  });
}
