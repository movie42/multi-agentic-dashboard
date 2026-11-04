import { services } from "@/server/container";
import type { WorktreeFlowScan } from "@/server/workflow/flowTasks";

export { flowTaskKey, mergeRepoFlowTasks, splitFlowTasks } from "@/server/workflow/flowTasks";
export type { WorktreeFlowScan, WorktreeFlowTasks } from "@/server/workflow/flowTasks";

export function scanFlowTasks(worktreePath: string, branch: string | null): Promise<WorktreeFlowScan> {
  return services().workflow.flowDocs.scan(worktreePath, branch);
}
