import "server-only";
import { z } from "zod";
import type { Report } from "@/server/shared/fallback";
import { JsonFile } from "@/server/shared/JsonFile";

const entrySchema = z.object({
  displayName: z.string().optional(),
  parentPath: z.string().optional(),
  reference: z.string().optional(),
});

const metaFileSchema = z.object({ worktrees: z.record(z.string(), entrySchema) });

export type WorktreeMetaEntry = z.infer<typeof entrySchema>;
type MetaFile = z.infer<typeof metaFileSchema>;

function compact(entry: WorktreeMetaEntry): WorktreeMetaEntry {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined && value !== ""));
}

export class WorktreeMeta {
  private readonly file: JsonFile<MetaFile>;

  constructor(file: string, warn: Report) {
    this.file = new JsonFile({ file, schema: metaFileSchema, empty: () => ({ worktrees: {} }), warn, scope: "worktree-meta" });
  }

  async read(): Promise<ReadonlyMap<string, WorktreeMetaEntry>> {
    return new Map(Object.entries((await this.file.read()).worktrees));
  }

  async patch(worktreePath: string, patch: WorktreeMetaEntry): Promise<void> {
    await this.patchAll(new Map([[worktreePath, patch]]));
  }

  async patchAll(patches: ReadonlyMap<string, WorktreeMetaEntry>): Promise<void> {
    await this.file.update((current) => ({
      worktrees: {
        ...current.worktrees,
        ...Object.fromEntries([...patches].map(([target, patch]) => [target, compact({ ...current.worktrees[target], ...patch })])),
      },
    }));
  }

  async remove(worktreePath: string): Promise<void> {
    await this.file.update((current) => ({
      worktrees: Object.fromEntries(Object.entries(current.worktrees).filter(([target]) => target !== worktreePath)),
    }));
  }
}
