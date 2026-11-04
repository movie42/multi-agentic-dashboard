import "server-only";
import type { PullRequestInfo, WorkflowMode } from "@/lib/workflow/types";
import { pullRequestListSchema } from "./schema";

const SHARED_BRANCH = /^(main|master|develop|staging|release\/.+|main-.+|develop-.+)$/;
const NOT_APPLICABLE_STDERR = /no git remotes|not a git repository|none of the git remotes/i;
const MISSING_REMOTE_STDERR = /no such remote|not a git repository/i;

export function isSharedBranch(branch: string): boolean {
  return SHARED_BRANCH.test(branch);
}

export function ownerFromRemoteUrl(url: string): string {
  const match = url.trim().match(/github\.com[:/]([^/]+)\//);
  return match ? match[1] : "unknown-host";
}

export function isMissingRemote(stderr: string): boolean {
  return MISSING_REMOTE_STDERR.test(stderr);
}

export function modeOf(owner: string | null, login: string | null): WorkflowMode {
  return owner === null || (login !== null && owner.toLowerCase() === login.toLowerCase()) ? "personal" : "company";
}

export function parsePullRequestList(stdout: string): PullRequestInfo {
  const [first] = pullRequestListSchema.parse(JSON.parse(stdout));
  return first
    ? { kind: "found", number: first.number, state: first.state, isDraft: first.isDraft, url: first.url }
    : { kind: "none" };
}

export function isPullRequestNotApplicable(stderr: string): boolean {
  return NOT_APPLICABLE_STDERR.test(stderr);
}
