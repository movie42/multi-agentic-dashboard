import "server-only";
import { LRUCache } from "lru-cache";
import { z } from "zod";
import type { JiraIssueInfo } from "@/common/workflow/types";
import { errorField, type ExecFileFn, type ReportFn } from "@/server/shared/ports";

const ISSUE_KEY = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const SITE_LINE = /^\s*Site:\s*(\S+)/m;

const issueViewSchema = z.looseObject({
  fields: z.looseObject({ status: z.looseObject({ name: z.string() }) }),
});

export function issueKeyOfBranch(branch: string | null): string | null {
  return branch?.match(ISSUE_KEY)?.[1] ?? null;
}

export function siteOfAuthStatus(stdout: string): string | null {
  const host = stdout.match(SITE_LINE)?.[1];
  if (!host) return null;
  return host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
}

export function statusOfIssueView(stdout: string): string {
  return issueViewSchema.parse(JSON.parse(stdout)).fields.status.name;
}

export interface JiraInfoOptions {
  execFile: ExecFileFn;
  warn: ReportFn;
  ttlMs?: number;
}

/** Issues move about once per half-day of work; a page reload forces an earlier refresh. */
export const JIRA_TTL_MS = 5 * 60 * 60_000;

/** Reads issue status straight from Jira through the `acli` CLI, the way `GitInfo` reads PRs through `gh`. */
export class JiraInfo {
  private readonly execFile: ExecFileFn;
  private readonly warn: ReportFn;
  private readonly statuses: LRUCache<string, { status: string | null }>;
  private site: Promise<string | null> | null = null;
  private resolvedSite: string | null = null;
  private forced = new Set<string>();

  constructor(options: JiraInfoOptions) {
    this.execFile = options.execFile;
    this.warn = options.warn;
    this.statuses = new LRUCache<string, { status: string | null }>({
      max: 500,
      ttl: options.ttlMs ?? JIRA_TTL_MS,
      allowStale: true,
      noDeleteOnStaleGet: true,
      fetchMethod: (key) => this.fetchStatus(key),
    });
  }

  /** Synchronous like `GitInfo.getPullRequest`: returns the cached value and refreshes in the background. */
  getIssue(branch: string | null): JiraIssueInfo {
    const key = issueKeyOfBranch(branch);
    if (!key) return { kind: "not-applicable" };
    void this.siteUrl();
    const forceRefresh = this.forced.delete(key);
    this.statuses.fetch(key, { forceRefresh }).catch((error: unknown) => this.warn("jira", error, { key }));
    const site = this.resolvedSite;
    const url = site ? `${site}/browse/${key}` : null;
    const cached = this.statuses.get(key);
    if (!cached) return { kind: "loading", key, url };
    return cached.status === null ? { kind: "unknown", key, url } : { kind: "found", key, url, status: cached.status };
  }

  /** Refetches every cached issue on its next read, keeping the old status on screen until the new one arrives. */
  requestRefresh(): void {
    this.forced = new Set(this.statuses.keys());
  }

  private siteUrl(): Promise<string | null> {
    this.site ??= this.execFile("acli", ["jira", "auth", "status"], { timeout: 10_000 }).then(
      ({ stdout }) => {
        this.resolvedSite = siteOfAuthStatus(stdout);
        return this.resolvedSite;
      },
      (error: unknown) => {
        this.warn("jira", error, { step: "acli jira auth status" });
        this.site = null;
        return null;
      },
    );
    return this.site;
  }

  private async fetchStatus(key: string): Promise<{ status: string | null }> {
    try {
      const { stdout } = await this.execFile("acli", ["jira", "workitem", "view", key, "--fields", "status", "--json"], {
        timeout: 15_000,
      });
      return { status: statusOfIssueView(stdout) };
    } catch (error) {
      this.warn("jira", error, { key, stderr: errorField(error, "stderr").trim() });
      return { status: null };
    }
  }
}
