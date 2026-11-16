import { create } from "zustand";

interface JumpRequests {
  pending: Record<string, number>;
  request: (agentId: string) => void;
  consume: (agentId: string) => void;
}

const useJumpRequests = create<JumpRequests>((set) => ({
  pending: {},
  request: (agentId) => set((state) => ({ pending: { ...state.pending, [agentId]: (state.pending[agentId] ?? 0) + 1 } })),
  consume: (agentId) =>
    set((state) => {
      if (!(agentId in state.pending)) return state;
      return { pending: Object.fromEntries(Object.entries(state.pending).filter(([id]) => id !== agentId)) };
    }),
}));

export function requestJump(agentId: string): void {
  useJumpRequests.getState().request(agentId);
}

export function consumeJump(agentId: string): void {
  useJumpRequests.getState().consume(agentId);
}

/** A number that changes on every new jump to this card, or 0 when none is waiting. */
export function useJumpRequest(agentId: string): number {
  return useJumpRequests((state) => state.pending[agentId] ?? 0);
}
