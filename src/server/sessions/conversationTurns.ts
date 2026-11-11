import type { ConversationTurn } from "@/common/sessions/types";
import { humanPrompt, parseEntry, textOf } from "./transcriptText";

export const TURN_LIMIT = 30;

function timeOf(timestamp: string | undefined): number | null {
  const at = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isNaN(at) ? null : at;
}

const NOT_A_PROMPT = /^(\[Request interrupted|\/compact(\s|$)|This session is being continued from a previous conversation)/;

function typedPrompt(content: unknown): string | null {
  const text = textOf(content);
  if (!text || NOT_A_PROMPT.test(text.trim())) return null;
  return humanPrompt(text);
}

// The answer to a prompt is the last assistant text before the next prompt; earlier
// texts are progress notes and tool calls already show in the activity timeline.
export function turnsOf(lines: string[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  lines.forEach((raw, index) => {
    const entry = parseEntry(raw);
    if (!entry || entry.isSidechain || entry.isMeta === true || entry.isCompactSummary === true) return;
    const content = entry.message?.content;
    if (entry.type === "user") {
      const prompt = typedPrompt(content);
      if (!prompt) return;
      const id = typeof entry.uuid === "string" ? entry.uuid : `line-${index}`;
      turns.push({ id, at: timeOf(entry.timestamp), prompt, answer: null });
    } else if (entry.type === "assistant") {
      const last = turns.at(-1);
      const text = textOf(content);
      if (last && text) last.answer = text;
    }
  });
  return turns.slice(-TURN_LIMIT);
}
