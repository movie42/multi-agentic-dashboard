import type { Attribution } from "./attribute";
import { ownersByHunk } from "./featureMap";
import type { FileText } from "./highlight";
import { changedLinesOf, symbolLines, type CodeSymbol, type SymbolIndex } from "./symbols";
import type { FileDiff, FileOwner, FlowData, FlowStep, FlowSymbol, Hunk, HunkPrecision, IntentGroup, ItemFlow } from "./types";

function flowKey(owner: FileOwner | null, planned: boolean): string {
  if (!planned) return "*";
  if (!owner) return "unknown";
  if (owner.kind === "item") return owner.id;
  return owner.kind === "intent" ? "*" : owner.kind;
}

function hunkLines(diff: FileDiff, hunk: Hunk): Set<number> {
  return changedLinesOf({ ...diff, hunks: [hunk] });
}

/**
 * One reading flow per plan item: start from the item's symbols nothing else in the item calls,
 * follow calls depth-first in the order they appear in the code. A call into another item's
 * symbol is shown as a link and not followed, so each item reads only what it built.
 */
export function buildFlows(
  files: FileDiff[],
  texts: Map<string, FileText>,
  index: SymbolIndex,
  attribution: Attribution,
  ranks: Map<string, number>,
): FlowData {
  const planned = attribution.plan !== null;
  const owners = ownersByHunk(attribution);
  const precision = new Map<string, HunkPrecision>();
  const intentOf = new Map<string, string>();
  const groups: IntentGroup[] = [
    ...(attribution.plan?.phases.flatMap((phase) => phase.items.flatMap((item) => item.groups)) ?? []),
    ...attribution.groups,
    ...attribution.unplanned,
  ];
  for (const group of groups) {
    for (const ref of group.hunks) {
      precision.set(ref.hunkId, ref.precision);
      intentOf.set(ref.hunkId, group.title);
    }
  }
  for (const ref of [...attribution.unknown]) precision.set(ref.hunkId, "none");

  const diffByFile = new Map(files.map((diff) => [diff.file, diff]));
  const symbols: Record<string, FlowSymbol> = {};
  const keyOf = new Map<string, string>();
  for (const symbol of index.symbols) {
    const diff = diffByFile.get(symbol.file);
    const text = texts.get(symbol.file);
    if (!diff || !text) continue;
    const votes = new Map<string, { owner: FileOwner; count: number }>();
    const intents: string[] = [];
    for (const hunk of diff.hunks) {
      const inside = [...hunkLines(diff, hunk)].filter((line) => line >= symbol.startLine && line <= symbol.endLine).length;
      if (inside === 0) continue;
      const owner = owners.get(hunk.id);
      if (owner) {
        const key = `${owner.kind}:${owner.id}`;
        votes.set(key, { owner, count: (votes.get(key)?.count ?? 0) + inside });
      }
      const intent = intentOf.get(hunk.id);
      if (intent && !intents.includes(intent)) intents.push(intent);
    }
    const owner = [...votes.values()].sort((a, b) => b.count - a.count)[0]?.owner ?? null;
    symbols[symbol.id] = {
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      file: symbol.file,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      owner,
      intents,
      lines: symbolLines(symbol, diff, text),
    };
    keyOf.set(symbol.id, flowKey(owner, planned));
  }

  const outgoing = new Map<string, typeof index.edges>();
  const incoming = new Map<string, string[]>();
  for (const edge of index.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  }
  for (const list of outgoing.values()) list.sort((a, b) => a.line - b.line);

  const byKey = new Map<string, CodeSymbol[]>();
  for (const symbol of index.symbols) {
    const key = keyOf.get(symbol.id);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), symbol]);
  }

  const symbolsOfFile = new Map<string, CodeSymbol[]>();
  for (const symbol of index.symbols) symbolsOfFile.set(symbol.file, [...(symbolsOfFile.get(symbol.file) ?? []), symbol]);
  const restByKey = new Map<string, { hunkId: string; precision: HunkPrecision }[]>();
  for (const diff of files) {
    for (const hunk of diff.hunks) {
      const lines = hunkLines(diff, hunk);
      const covered =
        lines.size > 0 &&
        [...lines].every((line) => (symbolsOfFile.get(diff.file) ?? []).some((symbol) => line >= symbol.startLine && line <= symbol.endLine));
      if (covered) continue;
      const key = flowKey(owners.get(hunk.id) ?? null, planned);
      restByKey.set(key, [...(restByKey.get(key) ?? []), { hunkId: hunk.id, precision: precision.get(hunk.id) ?? "none" }]);
    }
  }

  const flows: Record<string, ItemFlow> = {};
  const keys = new Set([...byKey.keys(), ...restByKey.keys()]);
  for (const key of keys) {
    const members = (byKey.get(key) ?? []).filter((symbol) => symbol.kind !== "type");
    const memberIds = new Set(members.map((symbol) => symbol.id));
    const isRoot = (symbol: CodeSymbol) => !(incoming.get(symbol.id) ?? []).some((from) => memberIds.has(from));
    const order = (a: CodeSymbol, b: CodeSymbol) =>
      Number((incoming.get(a.id) ?? []).length > 0) - Number((incoming.get(b.id) ?? []).length > 0) ||
      (ranks.get(b.file) ?? 0) - (ranks.get(a.file) ?? 0) ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine;

    const steps: FlowStep[] = [];
    const read = new Set<string>();
    const walk = (symbol: CodeSymbol, depth: number, via: FlowStep["via"]) => {
      read.add(symbol.id);
      steps.push({ symbolId: symbol.id, depth, via, kind: "own" });
      for (const edge of outgoing.get(symbol.id) ?? []) {
        const target = index.symbols.find((candidate) => candidate.id === edge.to);
        if (!target || !symbols[target.id]) continue;
        const edgeVia = { line: edge.line, text: edge.text };
        if (!memberIds.has(target.id)) steps.push({ symbolId: target.id, depth: depth + 1, via: edgeVia, kind: "foreign" });
        else if (read.has(target.id)) steps.push({ symbolId: target.id, depth: depth + 1, via: edgeVia, kind: "repeat" });
        else walk(target, depth + 1, edgeVia);
      }
    };
    for (const root of [...members.filter(isRoot)].sort(order)) if (!read.has(root.id)) walk(root, 0, null);
    for (const leftover of [...members].sort(order)) if (!read.has(leftover.id)) walk(leftover, 0, null);

    flows[key] = {
      steps,
      types: (byKey.get(key) ?? []).filter((symbol) => symbol.kind === "type").map((symbol) => symbol.id),
      rest: restByKey.get(key) ?? [],
    };
  }
  return { symbols, flows };
}
