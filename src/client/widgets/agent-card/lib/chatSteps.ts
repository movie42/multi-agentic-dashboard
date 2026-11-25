import type { ActivityStep } from "@/common/sessions/types";

/** The live question card is where the person answers, so the transcript's copy of that same waiting question is left out. */
export function withoutLiveQuestion(steps: ActivityStep[], liveQuestion: boolean): ActivityStep[] {
  if (!liveQuestion) return steps;
  return steps.filter((step) => !(step.kind === "question" && step.status === "running"));
}
