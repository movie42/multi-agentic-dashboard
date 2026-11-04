import path from "node:path";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SPECIFIER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

export function resolveImport(from: string, specifier: string, files: Set<string>): string | null {
  const base = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? path.posix.join(path.posix.dirname(from), specifier)
      : null;
  if (base === null) return null;
  for (const extension of EXTENSIONS) {
    if (files.has(base + extension)) return base + extension;
  }
  return null;
}

/** Changed file → the changed files it imports. Files that are not JS/TS source get no entry. */
export function importGraph(contents: Map<string, string>): Map<string, string[]> {
  const files = new Set(contents.keys());
  const deps = new Map<string, string[]>();
  for (const [file, text] of contents) {
    if (!SOURCE.test(file)) continue;
    const found = new Set<string>();
    for (const match of text.matchAll(SPECIFIER)) {
      const target = resolveImport(file, match[1], files);
      if (target && target !== file) found.add(target);
    }
    deps.set(file, [...found]);
  }
  return deps;
}

/**
 * Reading rank for each changed file: a file comes after every changed file it imports, so
 * types and contracts read first, then their implementations, then callers and screens.
 * Import cycles are cut where they are found.
 */
export function readingRanks(deps: Map<string, string[]>): Map<string, number> {
  const ranks = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (file: string): number => {
    const known = ranks.get(file);
    if (known !== undefined) return known;
    if (visiting.has(file)) return 0;
    visiting.add(file);
    const below = (deps.get(file) ?? []).map(rankOf);
    visiting.delete(file);
    const rank = below.length > 0 ? Math.max(...below) + 1 : 0;
    ranks.set(file, rank);
    return rank;
  };
  for (const file of deps.keys()) rankOf(file);
  return ranks;
}

/** Sort key inside one intent: import rank, then type files, then path. */
export function compareFiles(ranks: Map<string, number>, a: string, b: string): number {
  const rank = (ranks.get(a) ?? 0) - (ranks.get(b) ?? 0);
  if (rank !== 0) return rank;
  const typeFile = Number(/types?\.tsx?$/.test(b)) - Number(/types?\.tsx?$/.test(a));
  return typeFile || a.localeCompare(b);
}
