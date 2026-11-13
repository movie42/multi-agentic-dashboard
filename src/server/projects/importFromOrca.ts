import "server-only";
import path from "node:path";
import { z } from "zod";
import { errorCode, type ExecFileFn, type ReportFn } from "@/server/shared/ports";
import type { Project, ProjectRegistry } from "./ProjectRegistry";
import type { WorktreeMeta, WorktreeMetaEntry } from "./WorktreeMeta";

const TIMEOUT_MS = 15_000;
const RETRY_MS = 60_000;

const repoListSchema = z.looseObject({
  ok: z.literal(true),
  result: z.looseObject({
    repos: z.array(z.looseObject({ path: z.string(), displayName: z.string().nullish(), kind: z.string().nullish() })),
  }),
});

const worktreeListSchema = z.looseObject({
  ok: z.literal(true),
  result: z.looseObject({
    worktrees: z.array(
      z.looseObject({
        id: z.string(),
        path: z.string(),
        displayName: z.string().nullish(),
        displayNameMode: z.string().nullish(),
        parentWorktreeId: z.string().nullish(),
      }),
    ),
  }),
});

type OrcaRepos = z.infer<typeof repoListSchema>["result"]["repos"];
type OrcaWorktrees = z.infer<typeof worktreeListSchema>["result"]["worktrees"];

export function projectsOf(repos: OrcaRepos): Project[] {
  return repos.map((repo) => ({
    path: repo.path,
    name: repo.displayName || path.basename(repo.path),
    kind: repo.kind === "folder" ? "folder" : "git",
  }));
}

export function metaOf(worktrees: OrcaWorktrees): Map<string, WorktreeMetaEntry> {
  const pathOfId = new Map(worktrees.map((worktree) => [worktree.id, worktree.path]));
  return new Map(
    worktrees.flatMap((worktree): [string, WorktreeMetaEntry][] => {
      const displayName = worktree.displayNameMode === "fixed" && worktree.displayName ? worktree.displayName : undefined;
      const parentPath = worktree.parentWorktreeId ? pathOfId.get(worktree.parentWorktreeId) : undefined;
      return displayName || parentPath ? [[worktree.path, { displayName, parentPath }]] : [];
    }),
  );
}

export interface OrcaImportOptions {
  bin: string;
  execFile: ExecFileFn;
  projects: Pick<ProjectRegistry, "isInitialized" | "replaceAll">;
  meta: Pick<WorktreeMeta, "patchAll">;
  warn: ReportFn;
  now?: () => number;
}

export class OrcaImport {
  private attempt: Promise<void> | null = null;
  private failedAt: number | null = null;

  constructor(private readonly options: OrcaImportOptions) {}

  once(): Promise<void> {
    const now = (this.options.now ?? Date.now)();
    if (this.failedAt !== null && now - this.failedAt >= RETRY_MS) {
      this.attempt = null;
      this.failedAt = null;
    }
    this.attempt ??= this.run().then(
      (done) => {
        if (!done) this.failedAt = (this.options.now ?? Date.now)();
      },
      (error: unknown) => {
        this.failedAt = (this.options.now ?? Date.now)();
        this.options.warn("projects", error, { step: "import from orca" });
      },
    );
    return this.attempt;
  }

  private async run(): Promise<boolean> {
    const { bin, execFile, projects, meta, warn } = this.options;
    if (await projects.isInitialized()) return true;
    const read = async (args: string[]) => JSON.parse((await execFile(bin, [...args, "--json"], { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })).stdout);
    try {
      const repos = repoListSchema.parse(await read(["repo", "list"])).result.repos;
      const worktrees = worktreeListSchema.parse(await read(["worktree", "list"])).result.worktrees;
      await meta.patchAll(metaOf(worktrees));
      await projects.replaceAll(projectsOf(repos));
      console.log("[projects] imported from Orca", { projects: repos.length, worktrees: worktrees.length });
      return true;
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        await projects.replaceAll([]);
        return true;
      }
      warn("projects", error, { step: "import from orca" });
      return false;
    }
  }
}
