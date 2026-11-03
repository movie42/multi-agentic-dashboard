import { runOrca } from "./cli";
import { readRuntime } from "./runtime";
import type { OrcaTerminalRaw } from "./types";

const RETRY_MS = 60_000;

interface ReattachState {
  attemptedAt: Map<string, number>;
  inFlight: Promise<void> | null;
}

const globalState = globalThis as typeof globalThis & { __agentControlOrphans?: ReattachState };
globalState.__agentControlOrphans ??= { attemptedAt: new Map(), inFlight: null };
const state = globalState.__agentControlOrphans;

function isAgentOrphan(terminal: OrcaTerminalRaw): boolean {
  return terminal.orphaned === true && terminal.connected && Boolean(terminal.agentIdentity);
}

async function reattach(handles: string[]): Promise<void> {
  const runtime = await readRuntime();
  if (runtime.mode !== "app") return;
  for (const handle of handles) {
    state.attemptedAt.set(handle, Date.now());
    try {
      await runOrca(["terminal", "switch", "--terminal", handle]);
      console.log("[orphans] reattached", handle);
    } catch (error) {
      console.warn("[orphans] reattach failed", handle, error);
    }
  }
}

export function reattachOrphans(terminals: OrcaTerminalRaw[]): void {
  const live = new Set(terminals.map((terminal) => terminal.handle));
  for (const handle of state.attemptedAt.keys()) {
    if (!live.has(handle)) state.attemptedAt.delete(handle);
  }
  if (state.inFlight) return;
  const now = Date.now();
  const due = terminals
    .filter(isAgentOrphan)
    .map((terminal) => terminal.handle)
    .filter((handle) => now - (state.attemptedAt.get(handle) ?? 0) >= RETRY_MS);
  if (due.length === 0) return;
  state.inFlight = reattach(due)
    .catch((error: unknown) => console.warn("[orphans] reattach pass failed", error))
    .finally(() => {
      state.inFlight = null;
    });
}
