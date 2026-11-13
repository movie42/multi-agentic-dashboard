export interface ParsedMessage {
  lead: string;
  rest: string;
}

function isBlockStart(line: string): boolean {
  return /^(\s*[-*+] |\s*\d+\. |#{1,6} |\||```|>)/.test(line);
}

export function parseMessage(message: string | null): ParsedMessage | null {
  if (!message?.trim()) return null;
  const text = message.trim();

  const lines = text.split("\n");
  const firstText = lines.findIndex((line) => line.trim() !== "");
  const start = firstText < 0 ? lines.length : firstText;
  const leadEnd = lines.slice(start).findIndex((line) => line.trim() === "" || isBlockStart(line));
  const index = leadEnd < 0 ? lines.length : start + leadEnd;
  const leadLines = lines.slice(start, index);

  if (leadLines.length === 0) {
    return { lead: text, rest: "" };
  }
  return { lead: leadLines.join("\n"), rest: lines.slice(index).join("\n").trim() };
}
