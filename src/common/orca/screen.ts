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
  let end = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (OPTION_LINE.test(lines[index])) {
      end = index;
      break;
    }
  }
  if (end < 0) return null;

  let start = end;
  while (start > 0 && OPTION_LINE.test(lines[start - 1])) start -= 1;

  const options: ChoiceOption[] = [];
  for (let index = start; index <= end; index += 1) {
    const match = lines[index].match(OPTION_LINE);
    if (!match) continue;
    options.push({ number: Number(match[2]), label: match[3].trim(), selected: Boolean(match[1]) });
  }
  if (options.length < 2 || !options.some((option) => option.selected)) return null;

  const above = lines.slice(0, start).map(clean);
  let questionIndex = above.length - 1;
  while (questionIndex >= 0 && (above[questionIndex] === "" || isFrame(above[questionIndex]))) questionIndex -= 1;
  const question = questionIndex >= 0 ? above[questionIndex] : null;
  const context = above
    .slice(Math.max(0, questionIndex - CONTEXT_LINES), Math.max(0, questionIndex))
    .filter((line) => !isFrame(line));

  return { question, context, options };
}
