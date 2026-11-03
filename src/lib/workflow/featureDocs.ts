import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getPullRequest } from "./git";
import { getFeatureCheck } from "./remoteCheck";
import type { FeatureRowSummary, FeatureSummary, SharedWait } from "./types";

interface FeatureRowJson {
  id?: string;
  title?: string;
  issue?: string;
  story?: string;
  branch?: string;
  worktree?: string;
  jira?: { status?: string; todo?: string };
}

interface SharedJson {
  item?: string;
  usedBy?: string[] | string;
  buildIn?: string;
}

interface FeatureJson {
  id?: string;
  title?: string;
  root?: string;
  repo?: string;
  rows?: FeatureRowJson[];
  shared?: SharedJson[];
}

const cache = new Map<string, { mtimeMs: number; json: FeatureJson | null }>();

async function readFeature(file: string): Promise<FeatureJson | null> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs) return cached.json;
  let json: FeatureJson | null = null;
  try {
    json = JSON.parse(await readFile(file, "utf8")) as FeatureJson;
  } catch (error) {
    console.warn("[feature] unreadable feature document", file, error);
  }
  cache.set(file, { mtimeMs: info.mtimeMs, json });
  return json;
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

export async function featureDocsIn(worktreePath: string): Promise<string[]> {
  const dir = path.join(worktreePath, "docs", "features");
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, "feature.json"));
}

function toRow(row: FeatureRowJson, index: number): FeatureRowSummary {
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

function sharedWaits(shared: SharedJson[], rows: FeatureRowSummary[], repoPath: string | null): SharedWait[] {
  const waits: SharedWait[] = [];
  for (const entry of shared) {
    const buildIn = entry.buildIn?.trim() ?? "";
    const usedBy = Array.isArray(entry.usedBy) ? entry.usedBy : entry.usedBy ? [entry.usedBy] : [];
    const item = entry.item ?? buildIn;
    const owner = rows.find((row) => row.id === buildIn || row.issue === buildIn || row.branch === buildIn);
    const branch = owner?.branch ?? (/^feat\//.test(buildIn) ? buildIn : null);
    const where = owner?.worktree ?? repoPath;
    if (!branch || !where) {
      waits.push({ item, usedBy, reason: { kind: "unresolved", buildIn } });
      continue;
    }
    const pullRequest = getPullRequest(where, branch);
    if (pullRequest.kind === "not-applicable") continue;
    if (pullRequest.kind === "found" && pullRequest.state === "MERGED") continue;
    waits.push({ item, usedBy, reason: { kind: "pr", pullRequest, branch } });
  }
  return waits;
}

export async function loadFeatures(docPaths: Iterable<string>): Promise<FeatureSummary[]> {
  const features = new Map<string, FeatureSummary>();
  for (const docPath of docPaths) {
    const json = await readFeature(docPath);
    if (!json) continue;
    const id = json.id ?? path.basename(path.dirname(docPath));
    if (features.has(id)) continue;
    const rows = (json.rows ?? []).map(toRow);
    const repoPath = json.repo ?? null;
    const index = path.join(path.dirname(docPath), "index.html");
    features.set(id, {
      id,
      title: json.title ?? id,
      root: json.root ?? null,
      docPath,
      repo: null,
      pageIndex: (await exists(index)) ? index : null,
      repoPath,
      rows,
      sharedWaits: sharedWaits(json.shared ?? [], rows, repoPath),
      check: getFeatureCheck(id),
    });
  }
  return [...features.values()];
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
