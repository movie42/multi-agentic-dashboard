import "server-only";
import path from "node:path";
import { LRUCache } from "lru-cache";
import type { FeatureCheck, FeatureSummary } from "@/lib/workflow/types";
import { isMissingPath, listDir, pathExists, type FileSystemPort, type ReportFn } from "@/server/shared/ports";
import { sharedWaits, toFeatureRow, type PullRequestLookup } from "./features";
import { featureDocSchema, type FeatureDocJson } from "./schema";

interface CachedFeature {
  mtimeMs: number;
  json: FeatureDocJson | null;
}

export interface FeatureDocReaderOptions {
  fs: FileSystemPort;
  warn: ReportFn;
  pullRequestOf: PullRequestLookup;
  checkOf: (featureId: string) => FeatureCheck;
}

export class FeatureDocReader {
  private readonly features = new LRUCache<string, CachedFeature>({ max: 500 });

  constructor(private readonly options: FeatureDocReaderOptions) {}

  async docsIn(worktreePath: string): Promise<string[]> {
    const dir = path.join(worktreePath, "docs", "features");
    const entries = await listDir(this.options.fs, dir, this.options.warn, "feature");
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name, "feature.json"));
  }

  async load(docPaths: Iterable<string>): Promise<FeatureSummary[]> {
    const paths = [...docPaths];
    const docs = await Promise.all(paths.map((docPath) => this.read(docPath)));
    const firstById = paths
      .map((docPath, index) => ({ docPath, json: docs[index] }))
      .flatMap(({ docPath, json }) => (json ? [{ docPath, json, id: json.id ?? path.basename(path.dirname(docPath)) }] : []))
      .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index);
    return Promise.all(firstById.map(({ docPath, json, id }) => this.summarize(docPath, json, id)));
  }

  private async summarize(docPath: string, json: FeatureDocJson, id: string): Promise<FeatureSummary> {
    const rows = (json.rows ?? []).map(toFeatureRow);
    const repoPath = json.repo ?? null;
    const index = path.join(path.dirname(docPath), "index.html");
    return {
      id,
      title: json.title ?? id,
      root: json.root ?? null,
      docPath,
      repo: null,
      pageIndex: (await pathExists(this.options.fs, index, this.options.warn, "feature")) ? index : null,
      repoPath,
      rows,
      sharedWaits: sharedWaits(json.shared ?? [], rows, repoPath, this.options.pullRequestOf),
      check: this.options.checkOf(id),
    };
  }

  private async read(file: string): Promise<FeatureDocJson | null> {
    const info = await this.options.fs.stat(file).catch((error: unknown) => {
      if (!isMissingPath(error)) this.options.warn("feature", error, { file });
      return null;
    });
    if (!info?.isFile()) return null;
    const cached = this.features.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs) return cached.json;
    const json = await this.parse(file);
    this.features.set(file, { mtimeMs: info.mtimeMs, json });
    return json;
  }

  private async parse(file: string): Promise<FeatureDocJson | null> {
    try {
      return featureDocSchema.parse(JSON.parse(await this.options.fs.readFile(file)));
    } catch (error) {
      this.options.warn("feature", error, { file, reason: "unreadable feature document" });
      return null;
    }
  }
}
