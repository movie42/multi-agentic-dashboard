import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { SwitchBranchRequest } from "@/common/gitGraph/schema";
import type {
  CommitDetail,
  CommitDetailResponse,
  CommitDiffResponse,
  GitGraph,
  GitGraphResponse,
  SwitchBranchResponse,
  WorkingDiffResponse,
  WorkingTree,
  WorkingTreeResponse,
} from "@/common/gitGraph/types";
import { readJson } from "@/client/shared/api/json";

export const gitGraphKeys = {
  all: ["git-graph"] as const,
  graph: (worktreePath: string) => [...gitGraphKeys.all, "graph", worktreePath] as const,
  commit: (worktreePath: string, sha: string) => [...gitGraphKeys.all, "commit", worktreePath, sha] as const,
  commitDiff: (worktreePath: string, sha: string, file: string) => [...gitGraphKeys.all, "commit-diff", worktreePath, sha, file] as const,
  working: (worktreePath: string) => [...gitGraphKeys.all, "working", worktreePath] as const,
  workingDiff: (worktreePath: string, file: string) => [...gitGraphKeys.all, "working-diff", worktreePath, file] as const,
};

export const WORKING_POLL_MS = 5000;

export function gitGraphHref(worktreePath: string): string {
  return `/graph?${new URLSearchParams({ path: worktreePath }).toString()}`;
}

async function fetchGraph(worktreePath: string, skip: number, signal: AbortSignal): Promise<GitGraph> {
  const params = new URLSearchParams({ path: worktreePath, skip: String(skip) });
  const response = await fetch(`/api/git-graph?${params.toString()}`, { signal, cache: "no-store" });
  const body = await readJson<GitGraphResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.graph;
}

async function fetchCommit(worktreePath: string, sha: string, signal: AbortSignal): Promise<CommitDetail> {
  const params = new URLSearchParams({ path: worktreePath, sha });
  const response = await fetch(`/api/git-graph/commit?${params.toString()}`, { signal, cache: "no-store" });
  const body = await readJson<CommitDetailResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.commit;
}

export function gitGraphQueryOptions(worktreePath: string) {
  return infiniteQueryOptions({
    queryKey: gitGraphKeys.graph(worktreePath),
    queryFn: ({ pageParam, signal }) => fetchGraph(worktreePath, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((sum, page) => sum + page.commits.length, 0) : undefined),
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function commitDetailQueryOptions(worktreePath: string, sha: string) {
  return queryOptions({
    queryKey: gitGraphKeys.commit(worktreePath, sha),
    queryFn: ({ signal }) => fetchCommit(worktreePath, sha, signal),
    staleTime: Infinity,
    retry: false,
  });
}

async function fetchCommitDiff(worktreePath: string, sha: string, file: string, from: string | null, signal: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ path: worktreePath, sha, file });
  if (from) params.set("from", from);
  const response = await fetch(`/api/git-graph/commit/diff?${params.toString()}`, { signal, cache: "no-store" });
  const body = await readJson<CommitDiffResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.diff;
}

export function commitDiffQueryOptions(worktreePath: string, sha: string, file: string, from: string | null) {
  return queryOptions({
    queryKey: gitGraphKeys.commitDiff(worktreePath, sha, file),
    queryFn: ({ signal }) => fetchCommitDiff(worktreePath, sha, file, from, signal),
    staleTime: Infinity,
    retry: false,
  });
}

export async function postSwitchBranch(request: SwitchBranchRequest): Promise<string> {
  const response = await fetch("/api/git-graph/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await readJson<SwitchBranchResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.branch;
}

async function fetchWorkingTree(worktreePath: string, signal: AbortSignal): Promise<WorkingTree> {
  const response = await fetch(`/api/git-graph/working?${new URLSearchParams({ path: worktreePath }).toString()}`, { signal, cache: "no-store" });
  const body = await readJson<WorkingTreeResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.tree;
}

async function fetchWorkingDiff(worktreePath: string, file: string, signal: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ path: worktreePath, file });
  const response = await fetch(`/api/git-graph/working/diff?${params.toString()}`, { signal, cache: "no-store" });
  const body = await readJson<WorkingDiffResponse>(response);
  if (!body.ok) throw new Error(body.error);
  return body.diff;
}

export function workingTreeQueryOptions(worktreePath: string) {
  return queryOptions({
    queryKey: gitGraphKeys.working(worktreePath),
    queryFn: ({ signal }) => fetchWorkingTree(worktreePath, signal),
    refetchInterval: WORKING_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function workingDiffQueryOptions(worktreePath: string, file: string) {
  return queryOptions({
    queryKey: gitGraphKeys.workingDiff(worktreePath, file),
    queryFn: ({ signal }) => fetchWorkingDiff(worktreePath, file, signal),
    refetchInterval: WORKING_POLL_MS,
    retry: false,
  });
}
