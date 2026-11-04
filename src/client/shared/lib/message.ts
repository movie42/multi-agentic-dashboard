export const PREVIEW_LIMIT = 200;

export interface ParsedMessage {
  lead: string;
  rest: string;
  isPreview: boolean;
}

function restoreLineBreaks(text: string): string {
  return text
    .replace(/\s+(#{1,4} )/g, "\n\n$1")
    .replace(/([.:)」"'`*다요음])\s+- /g, "$1\n- ")
    .replace(/\s+(\d+\. \*\*)/g, "\n$1");
}

function isBlockStart(line: string): boolean {
  return /^(\s*[-*+] |\s*\d+\. |#{1,6} |\||```|>)/.test(line);
}

export function parseMessage(message: string | null): ParsedMessage | null {
  if (!message?.trim()) return null;
  const isPreview = !message.includes("\n") && message.length <= PREVIEW_LIMIT;
  const text = (isPreview ? restoreLineBreaks(message) : message).trim();

  const lines = text.split("\n");
  const firstText = lines.findIndex((line) => line.trim() !== "");
  const start = firstText < 0 ? lines.length : firstText;
  const leadEnd = lines.slice(start).findIndex((line) => line.trim() === "" || isBlockStart(line));
  const index = leadEnd < 0 ? lines.length : start + leadEnd;
  const leadLines = lines.slice(start, index);

  if (leadLines.length === 0) {
    return { lead: text, rest: "", isPreview };
  }
  return { lead: leadLines.join("\n"), rest: lines.slice(index).join("\n").trim(), isPreview };
}
