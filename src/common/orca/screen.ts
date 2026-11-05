export interface ChoiceOption {
  number: number;
  label: string;
  selected: boolean;
}

export interface ChoicePrompt {
  question: string | null;
  context: string[];
  options: ChoiceOption[];
}

export interface TerminalScreen {
  lines: string[];
  choice: ChoicePrompt | null;
}

export type TerminalScreenResponse = { ok: true; screen: TerminalScreen } | { ok: false; error: string };

const OPTION_LINE = /^[\s│]*(❯|›|>)?\s*(\d)\.\s+(.+?)[\s│]*$/;
const CONTEXT_LINES = 14;

function isFrame(line: string): boolean {
  return /^[\s─━│╭╮╰╯┌┐└┘═-]*$/.test(line);
}

function clean(line: string): string {
  return line.replace(/^[\s│]+|[\s│]+$/g, "");
}

export function parseChoicePrompt(lines: string[]): ChoicePrompt | null {
  const end = lines.findLastIndex((line) => OPTION_LINE.test(line));
  if (end < 0) return null;

  const optionsAbove = lines.slice(0, end).reverse().findIndex((line) => !OPTION_LINE.test(line));
  const start = optionsAbove < 0 ? 0 : end - optionsAbove;

  const options: ChoiceOption[] = lines.slice(start, end + 1).flatMap((line) => {
    const match = line.match(OPTION_LINE);
    return match ? [{ number: Number(match[2]), label: (match[3] ?? "").trim(), selected: Boolean(match[1]) }] : [];
  });
  if (options.length < 2 || !options.some((option) => option.selected)) return null;

  const above = lines.slice(0, start).map(clean);
  const questionIndex = above.findLastIndex((line) => line !== "" && !isFrame(line));
  const question = questionIndex >= 0 ? (above[questionIndex] ?? null) : null;
  const context = above
    .slice(Math.max(0, questionIndex - CONTEXT_LINES), Math.max(0, questionIndex))
    .filter((line) => !isFrame(line));

  return { question, context, options };
}
