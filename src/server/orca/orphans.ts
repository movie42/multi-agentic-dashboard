import "server-only";
import type { OrcaTerminalRaw } from "./schema";

export function isAgentOrphan(terminal: OrcaTerminalRaw): boolean {
  return terminal.orphaned === true && terminal.connected && Boolean(terminal.agentIdentity);
}

export function staleAttempts(attemptedAt: ReadonlyMap<string, number>, terminals: OrcaTerminalRaw[]): string[] {
  const live = new Set(terminals.map((terminal) => terminal.handle));
  return [...attemptedAt.keys()].filter((handle) => !live.has(handle));
}

export function dueOrphans(
  terminals: OrcaTerminalRaw[],
  attemptedAt: ReadonlyMap<string, number>,
  now: number,
  retryMs: number,
): string[] {
  return terminals
    .filter(isAgentOrphan)
    .map((terminal) => terminal.handle)
    .filter((handle) => now - (attemptedAt.get(handle) ?? 0) >= retryMs);
}
