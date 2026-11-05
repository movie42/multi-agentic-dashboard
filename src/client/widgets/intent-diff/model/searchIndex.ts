import type { AskThread, IntentDiffResult } from "@/common/intentDiff/types";

export type SearchGroup = "file" | "symbol" | "code" | "plan" | "thread";

export const GROUP_ORDER: readonly SearchGroup[] = ["file", "symbol", "code", "plan", "thread"];

/** A line to reveal: every code view showing `file` opens the fold holding it. */
export interface LineTarget {
  file: string;
  line: number;
  side: "new" | "old";
}

export interface SearchTarget {
  /** An element id on the page to scroll to, when there is one. */
  anchor: string | null;
  line: LineTarget | null;
  /** The page has to show the plan reading mode for the anchor to exist. */
  needsPlan: boolean;
}

export interface SearchEntry {
  key: string;
  group: SearchGroup;
  title: string;
  detail: string;
  haystack: string;
  target: SearchTarget;
}

export interface SearchHit {
  key: string;
  group: SearchGroup;
  title: string;
  detail: string;
  target: SearchTarget;
}

const PER_GROUP = 30;

function entry(key: string, group: SearchGroup, title: string, detail: string, text: string, target: SearchTarget): SearchEntry {
  return { key, group, title, detail, haystack: text.toLowerCase(), target };
}

function lineTarget(file: string, newNo: number | null, oldNo: number | null): LineTarget | null {
  if (newNo !== null) return { file, line: newNo, side: "new" };
  if (oldNo !== null) return { file, line: oldNo, side: "old" };
  return null;
}

export function buildSearchIndex(result: IntentDiffResult, threads: AskThread[], stepAnchor: (symbolId: string) => string): SearchEntry[] {
  const files = result.files.flatMap((file) => {
    const first = file.hunks[0]?.lines.find((line) => line.newNo !== null || line.oldNo !== null);
    return [entry(`file:${file.file}`, "file", file.file, "", file.file, { anchor: null, line: first ? lineTarget(file.file, first.newNo, first.oldNo) : null, needsPlan: false })];
  });
  const symbols = Object.values(result.flow.symbols).map((symbol) =>
    entry(`symbol:${symbol.id}`, "symbol", symbol.name, `${symbol.file}:${symbol.startLine}`, `${symbol.name} ${symbol.intents.join(" ")}`, {
      anchor: stepAnchor(symbol.id),
      line: { file: symbol.file, line: symbol.startLine, side: "new" },
      needsPlan: true,
    }),
  );
  const shownLines = [
    ...result.files.flatMap((file) => file.hunks.flatMap((hunk) => hunk.lines.map((line) => ({ file: file.file, line })))),
    ...Object.values(result.flow.symbols).flatMap((symbol) => symbol.lines.map((line) => ({ file: symbol.file, line }))),
  ];
  const code = [
    ...new Map(
      shownLines.flatMap(({ file, line }) => {
        const target = lineTarget(file, line.newNo, line.oldNo);
        if (!target || !line.text.trim()) return [];
        const key = `code:${file}:${target.side}:${target.line}`;
        const mark = line.kind === "add" ? "+" : line.kind === "del" ? "−" : " ";
        return [[key, entry(key, "code", `${mark} ${line.text.trim()}`, `${file}:${target.line}`, line.text, { anchor: null, line: target, needsPlan: false })] as const];
      }),
    ).values(),
  ];
  const plan = (result.plan?.phases ?? []).flatMap((phase) =>
    phase.items.map((item) =>
      entry(`plan:${item.id}`, "plan", item.title, item.id, `${item.id} ${item.title} ${item.groups.map((group) => `${group.title} ${group.notes.join(" ")}`).join(" ")}`, {
        anchor: `item-${item.id}`,
        line: null,
        needsPlan: true,
      }),
    ),
  );
  const asked = threads.map((thread) => {
    const text = [...thread.turns.flatMap((turn) => [turn.question, turn.answer ?? ""]), thread.conclusion?.text ?? ""].join(" ");
    const first = thread.turns[0]?.question ?? thread.label;
    const target: SearchTarget =
      thread.anchor.kind === "step"
        ? { anchor: stepAnchor(thread.anchor.symbolId), line: null, needsPlan: true }
        : { anchor: null, line: { file: thread.anchor.file, line: thread.anchor.endLine, side: "new" }, needsPlan: false };
    return entry(`thread:${thread.id}`, "thread", first, `${thread.anchor.file}:${thread.anchor.startLine}`, `${thread.label} ${text}`, target);
  });
  return [...files, ...symbols, ...code, ...plan, ...asked];
}

/** Entries holding every word of the query, grouped in GROUP_ORDER, at most PER_GROUP each. */
export function searchIndex(entries: SearchEntry[], query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matched = entries.filter((item) => words.every((word) => item.haystack.includes(word)));
  return GROUP_ORDER.flatMap((group) =>
    matched
      .filter((item) => item.group === group)
      .slice(0, PER_GROUP)
      .map(({ key, title, detail, target }) => ({ key, group, title, detail, target })),
  );
}
