import "server-only";
import path from "node:path";
import { LRUCache } from "lru-cache";
import type { FlowTaskSummary } from "@/lib/workflow/types";
import { listDir, pathExists, type FileSystemPort, type ReportFn } from "@/server/shared/ports";
import { summarizeFlowTask, type WorktreeFlowScan } from "./flowTasks";
import { flowTaskSchema, type FlowTaskJson } from "./schema";

interface CachedTask {
  mtimeMs: number;
  json: FlowTaskJson | null;
}

export class FlowDocReader {
  private readonly tasks = new LRUCache<string, CachedTask>({ max: 2000 });

  constructor(
    private readonly fs: FileSystemPort,
    private readonly warn: ReportFn,
  ) {}

  async scan(worktreePath: string, branch: string | null): Promise<WorktreeFlowScan> {
    const docs = path.join(worktreePath, "docs");
    const domains = (await listDir(this.fs, docs, this.warn, "flow")).filter((entry) => entry.isDirectory());
    const perDomain = await Promise.all(
      domains.map((entry) => this.scanDomain(path.join(docs, entry.name), entry.name)),
    );
    return { branch, tasks: perDomain.flat() };
  }

  private async scanDomain(domainDir: string, domain: string): Promise<FlowTaskSummary[]> {
    if (!(await this.exists(path.join(domainDir, "domain.json")))) return [];
    const taskFiles = (await listDir(this.fs, path.join(domainDir, "tasks"), this.warn, "flow")).filter((entry) =>
      entry.name.endsWith(".json"),
    );
    const prdExists =
      (await this.exists(path.join(domainDir, "prd.md"))) || (await this.exists(path.join(domainDir, "prd")));
    const summaries = await Promise.all(
      taskFiles.map(async (entry) => {
        const { json, mtimeMs } = await this.readTask(path.join(domainDir, "tasks", entry.name));
        if (!json) return null;
        const taskId = json.id ?? entry.name.replace(/\.json$/, "");
        const index = path.join(domainDir, taskId, "index.html");
        const pageIndex = (await this.exists(index)) ? index : null;
        return summarizeFlowTask(json, { domain, domainDir, prdExists, pageIndex, mtimeMs });
      }),
    );
    return summaries.filter((summary): summary is FlowTaskSummary => summary !== null);
  }

  private async readTask(file: string): Promise<CachedTask> {
    const info = await this.fs.stat(file);
    const cached = this.tasks.get(file);
    if (cached && cached.mtimeMs === info.mtimeMs) return cached;
    const entry = { mtimeMs: info.mtimeMs, json: await this.parse(file) };
    this.tasks.set(file, entry);
    return entry;
  }

  private async parse(file: string): Promise<FlowTaskJson | null> {
    try {
      return flowTaskSchema.parse(JSON.parse(await this.fs.readFile(file)));
    } catch (error) {
      this.warn("flow", error, { file, reason: "unreadable task" });
      return null;
    }
  }

  private exists(target: string): Promise<boolean> {
    return pathExists(this.fs, target, this.warn, "flow");
  }
}
