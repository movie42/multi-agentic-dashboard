import type { UserQuestion } from "./types";

export const ASK_USER_QUESTION = "AskUserQuestion";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function questionsOf(toolInput: Record<string, unknown>): UserQuestion[] {
  const raw = toolInput.questions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is UserQuestion =>
      isRecord(item) &&
      typeof item.question === "string" &&
      Array.isArray(item.options) &&
      item.options.every((option: unknown) => isRecord(option) && typeof option.label === "string"),
  );
}
