import type { A2uiMessage } from "@/common/a2ui/messages";
import type { RunnerQuestion } from "@/common/runner/questions";
import { button, escapeMarkdown, surface, text, type Component } from "./surfaceParts";

export const QUESTION_SURFACE = "question";

/** One question, one option picked, nothing else to fill in: picking sends at once. */
export function isInstant(questions: readonly RunnerQuestion[]): boolean {
  return questions.length === 1 && !questions[0]?.multiSelect;
}

const key = (index: number) => `q${index}`;
const call = (name: string, args: Record<string, unknown>) => ({ "@call": name, args });

function questionBlock(question: RunnerQuestion, index: number, instant: boolean): Component[] {
  const q = key(index);
  const options = question.options.map((option, optionIndex): Component => ({
    id: `${q}o${optionIndex}`,
    component: "Option",
    label: option.label,
    ...(option.description ? { description: option.description } : {}),
    ...(option.preview ? { preview: option.preview } : {}),
    ...(instant
      ? { action: { event: { name: "answer", context: { question: index, text: option.label } } } }
      : { value: option.label, selection: { "@path": `/picked/${q}` }, single: !question.multiSelect }),
  }));
  const field: Component = {
    id: `${q}Typed`,
    component: "TextField",
    value: { "@path": `/typed/${q}` },
    placeholder: "직접 입력",
    "@accessibility": { label: `${question.question} 직접 입력` },
    ...(instant ? { action: { event: { name: "answer", context: { question: index, text: { "@path": `/typed/${q}` } } } } } : {}),
  };
  const head = question.header ? [text(`${q}Header`, question.header, "caption")] : [];
  return [
    { id: q, component: "Column", children: [...head.map((item) => item.id), `${q}Title`, ...options.map((item) => item.id), field.id] },
    ...head,
    text(`${q}Title`, `**${escapeMarkdown(question.question)}**`),
    ...options,
    field,
  ];
}

/** AskUserQuestion as an A2UI surface; actions are answer (instant) and submit (several questions). */
export function questionSurface(questions: readonly RunnerQuestion[]): A2uiMessage[] {
  const instant = isInstant(questions);
  const blocks = questions.flatMap((question, index) => questionBlock(question, index, instant));
  const answered = questions.map((_, index) =>
    call("or", { values: [call("required", { value: { "@path": `/picked/${key(index)}` } }), call("required", { value: { "@path": `/typed/${key(index)}` } })] }),
  );
  const send: Component[] = instant
    ? []
    : [
        { id: "sendRow", component: "Row", justify: "end", children: ["send"] },
        {
          ...button("send", "보내기", "submit", { variant: "primary", context: { picked: { "@path": "/picked" }, typed: { "@path": "/typed" } } })[0],
          id: "send",
          component: "Button",
          "@checks": [{ condition: call("and", { values: answered }), message: "모든 질문에 답해 주세요" }],
        },
        text("sendLabel", "보내기"),
      ];
  const data = {
    picked: Object.fromEntries(questions.map((_, index) => [key(index), []])),
    typed: Object.fromEntries(questions.map((_, index) => [key(index), ""])),
  };
  return surface(
    QUESTION_SURFACE,
    [{ id: "root", component: "Column", children: [...questions.map((_, index) => key(index)), ...(instant ? [] : ["sendRow"])] }, ...blocks, ...send],
    data,
  );
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

/** Turns the submit context back into AskUserQuestion answers keyed by question text: typed text wins, picks are joined. */
export function answersFrom(questions: readonly RunnerQuestion[], context: Record<string, unknown>): Record<string, string> {
  const picked = record(context.picked);
  const typed = record(context.typed);
  return Object.fromEntries(
    questions.map((question, index) => {
      const own = typeof typed[key(index)] === "string" ? String(typed[key(index)]).trim() : "";
      const picks = picked[key(index)];
      const joined = Array.isArray(picks) ? picks.filter((item: unknown) => typeof item === "string").join(", ") : "";
      return [question.question, own || joined];
    }),
  );
}
