import type { ActivityStep, ToolDocument } from "@/common/sessions/types";
import type { RunnerQuestion } from "@/common/runner/questions";

const PR_WORD = /\bPR\b|pull request/i;
const PR_BODY_FILE = /(^|[^a-z])(pr|pull[-_]?request)([-_.]?body)?[^/]*\.(md|mdx|markdown)$/i;

export function asksAboutPr(questions: RunnerQuestion[]): boolean {
  return questions.some((question) => PR_WORD.test(`${question.header ?? ""} ${question.question}`));
}

/** The PR body the session wrote most recently — the draft a "create this PR?" question is about. */
export function latestPrDraft(steps: ActivityStep[]): ToolDocument | null {
  const draft = steps.findLast(
    (step) => step.kind === "tool" && step.document !== null && PR_BODY_FILE.test(step.document.path.split("/").pop() ?? ""),
  );
  return draft?.kind === "tool" ? draft.document : null;
}
