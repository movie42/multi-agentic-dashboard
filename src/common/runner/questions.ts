import type { RunnerPermission } from "./types";

export const ASK_USER_QUESTION = "AskUserQuestion";

export interface RunnerQuestionOption {
  label: string;
  description?: string;
  /** Mockup or snippet shown beside the option (AskUserQuestion `preview`). */
  preview?: string;
}

export interface RunnerQuestion {
  question: string;
  header?: string;
  options: RunnerQuestionOption[];
  multiSelect?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function questionsOf(permission: Pick<RunnerPermission, "toolName" | "toolInput">): RunnerQuestion[] {
  if (permission.toolName !== ASK_USER_QUESTION) return [];
  const raw = permission.toolInput.questions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item: unknown): item is RunnerQuestion =>
      isRecord(item) &&
      typeof item.question === "string" &&
      Array.isArray(item.options) &&
      item.options.every((option: unknown) => isRecord(option) && typeof option.label === "string"),
  );
}
