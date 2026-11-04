import "server-only";
import type { FeatureRowSummary, FeatureSummary, PullRequestInfo, SharedWait } from "@/lib/workflow/types";
import type { FeatureRowJson, FeatureSharedJson } from "./schema";

export type PullRequestLookup = (worktreePath: string, branch: string) => PullRequestInfo;

export function toFeatureRow(row: FeatureRowJson, index: number): FeatureRowSummary {
  return {
    id: row.id ?? row.issue ?? `row-${index + 1}`,
    title: row.title ?? row.id ?? "",
    issue: row.issue ?? null,
    branch: row.branch ?? null,
    worktree: row.worktree ?? null,
    jiraStatus: row.jira?.status ?? null,
    jiraTodo: row.jira?.todo ?? null,
  };
}

export function sharedWaits(
  shared: FeatureSharedJson[],
  rows: FeatureRowSummary[],
  repoPath: string | null,
  pullRequestOf: PullRequestLookup,
): SharedWait[] {
  return shared.flatMap((entry): SharedWait[] => {
    const buildIn = entry.buildIn?.trim() ?? "";
    const usedBy = Array.isArray(entry.usedBy) ? entry.usedBy : entry.usedBy ? [entry.usedBy] : [];
    const item = entry.item ?? buildIn;
    const owner = rows.find((row) => row.id === buildIn || row.issue === buildIn || row.branch === buildIn);
    const branch = owner?.branch ?? (/^feat\//.test(buildIn) ? buildIn : null);
    const where = owner?.worktree ?? repoPath;
    if (!branch || !where) return [{ item, usedBy, reason: { kind: "unresolved", buildIn } }];
    const pullRequest = pullRequestOf(where, branch);
    if (pullRequest.kind === "not-applicable") return [];
    if (pullRequest.kind === "found" && pullRequest.state === "MERGED") return [];
    return [{ item, usedBy, reason: { kind: "pr", pullRequest, branch } }];
  });
}

export function featureOfWorktree(
  features: FeatureSummary[],
  repo: string,
  worktreePath: string,
  branch: string | null,
  taskFeatureDocs: (string | null)[],
): FeatureSummary | null {
  const sameRepo = features.filter((feature) => feature.repo === null || feature.repo === repo);
  const byRow = sameRepo.find((feature) =>
    feature.rows.some((row) => row.worktree === worktreePath || (branch !== null && row.branch === branch)),
  );
  if (byRow) return byRow;
  return sameRepo.find((feature) => taskFeatureDocs.includes(feature.docPath)) ?? null;
}
