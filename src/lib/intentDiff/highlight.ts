import { services } from "@/server/container";
import { type FileText, langOf } from "@/server/intentDiff/Highlighter";
import type { DiffRange, FileDiff, SymbolLookup } from "./types";

export { langOf };
export type { FileText };

export function highlightLines(code: string, file: string): Promise<string[]> {
  return services().highlighter.lines(code, file);
}

export function highlightDiffs(range: DiffRange, files: FileDiff[]): Promise<Map<string, FileText>> {
  return services().highlighter.diffs(range, files);
}

export function highlightLookup(root: string, lookup: SymbolLookup): Promise<void> {
  return services().highlighter.lookup(root, lookup);
}
