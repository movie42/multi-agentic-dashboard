import { services } from "@/server/container";
import type { CheckInput } from "@/server/workflow/featureCheck";
import type { FeatureCheck } from "./types";

export type { CheckInput, CheckWorktree } from "@/server/workflow/featureCheck";

export function getFeatureCheck(featureId: string): FeatureCheck {
  return services().workflow.featureChecks.get(featureId);
}

export function startFeatureCheck(input: CheckInput): void {
  void services().workflow.featureChecks.start(input);
}
