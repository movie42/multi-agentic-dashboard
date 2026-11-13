import { create } from "zustand";

interface TerminalRequests {
  counts: Record<string, number>;
  request: (sessionId: string) => void;
}

const useTerminalRequests = create<TerminalRequests>((set) => ({
  counts: {},
  request: (sessionId) => set((state) => ({ counts: { ...state.counts, [sessionId]: (state.counts[sessionId] ?? 0) + 1 } })),
}));

export function requestTerminal(sessionId: string): void {
  useTerminalRequests.getState().request(sessionId);
}

export function useTerminalRequest(sessionId: string | null): number {
  return useTerminalRequests((state) => (sessionId ? (state.counts[sessionId] ?? 0) : 0));
}
