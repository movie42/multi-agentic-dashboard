export interface FuzzyHit {
  path: string;
  score: number;
  /** Character positions in `path` that matched, for bolding. */
  indices: number[];
}

const SEPARATORS: ReadonlySet<string> = new Set(["/", "-", "_", ".", " "]);

const NAME_BONUS = 100;

function isWordStart(text: string, index: number): boolean {
  const previous = text[index - 1];
  if (previous === undefined || SEPARATORS.has(previous)) return true;
  const char = text[index] ?? "";
  return char !== char.toLowerCase() && previous === previous.toLowerCase();
}

/** Greedy subsequence match of `needle` inside `text[from..]`, scored on runs, word starts and gaps. */
function matchFrom(needle: string, text: string, from: number): { score: number; indices: number[] } | null {
  const lower = text.toLowerCase();
  const indices: number[] = [];
  // eslint-disable-next-line no-restricted-syntax -- position loop: the score grows as each letter is found
  let score = 0;
  // eslint-disable-next-line no-restricted-syntax -- position loop: where the next letter search starts
  let cursor = from;
  for (const char of needle) {
    const found = lower.indexOf(char, cursor);
    if (found === -1) return null;
    const previous = indices.at(-1);
    if (previous !== undefined) score += found === previous + 1 ? 5 : -Math.min(found - previous - 1, 10) * 0.5;
    if (isWordStart(text, found)) score += 3;
    indices.push(found);
    cursor = found + 1;
  }
  return { score, indices };
}

/**
 * Matches `query` as a subsequence of `path`, as VS Code's quick open does. A match that fits inside
 * the file name ranks above one spread over folders; runs and word starts score higher, gaps lower.
 */
export function fuzzyMatch(query: string, path: string): FuzzyHit | null {
  const needle = query.replace(/\s+/g, "").toLowerCase();
  if (!needle) return { path, score: 0, indices: [] };
  const nameStart = path.lastIndexOf("/") + 1;
  const inName = matchFrom(needle, path, nameStart);
  if (inName) return { path, score: NAME_BONUS + inName.score - (path.length - nameStart) * 0.05, indices: inName.indices };
  const anywhere = matchFrom(needle, path, 0);
  if (!anywhere) return null;
  return { path, score: anywhere.score - path.length * 0.01, indices: anywhere.indices };
}

export function rankFiles(query: string, paths: readonly string[], limit: number): FuzzyHit[] {
  const hits: FuzzyHit[] = [];
  for (const path of paths) {
    const hit = fuzzyMatch(query, path);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}
