import { services } from "@/server/container";
import type { SnapshotStep } from "@/server/intentDiff/SnapshotLog";
import type { SnapshotRecord } from "@/server/intentDiff/schema";

export type { SnapshotRecord, SnapshotStep };

export function loadSnapshotSteps(roots: string[], since: number, until: number | null): Promise<SnapshotStep[]> {
  return services().snapshotLog.loadSteps(roots, since, until);
}

export function readAtTree(worktreePath: string, tree: string, file: string): Promise<string | null> {
  return services().snapshotLog.readAtTree(worktreePath, tree, file);
}
