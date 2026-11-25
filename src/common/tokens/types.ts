/** Tokens by kind, as Claude's API reports them on each assistant message. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface TokenTally {
  total: TokenCounts;
}

export type TokenTallyResponse = ({ ok: true } & TokenTally) | { ok: false; error: string };

export const ZERO_TOKENS: TokenCounts = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

export function sumTokens(counts: TokenCounts): number {
  return counts.input + counts.output + counts.cacheWrite + counts.cacheRead;
}

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead };
}
