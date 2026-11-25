import type { TokenCounts } from "@/common/tokens/types";

export interface TokenKind {
  key: keyof TokenCounts;
  label: string;
  /** Tailwind fill class for the share bar. */
  fill: string;
}

export const TOKEN_KINDS: readonly TokenKind[] = [
  { key: "input", label: "입력", fill: "fill-now" },
  { key: "output", label: "출력", fill: "fill-accent" },
  { key: "cacheWrite", label: "캐시 쓰기", fill: "fill-pr" },
  { key: "cacheRead", label: "캐시 읽기", fill: "fill-focus" },
];

export function formatTokens(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString("ko-KR");
}
