import { services } from "@/server/container";
import type { FeatureSummary } from "./types";

export { featureOfWorktree } from "@/server/workflow/features";

export function featureDocsIn(worktreePath: string): Promise<string[]> {
  return services().workflow.featureDocs.docsIn(worktreePath);
}

export function loadFeatures(docPaths: Iterable<string>): Promise<FeatureSummary[]> {
  return services().workflow.featureDocs.load(docPaths);
}
