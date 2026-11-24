import { create } from "zustand";
import { postSessionMessage, thisWindowId } from "./sessionWindowChannel";

interface SessionDockState {
  /** A session this window's canvas should open as a right-panel tab. */
  pending: string | null;
  /** Gives up on a request no canvas took; the window that has the session keeps it. */
  settle: (agentId: string) => void;
  /** A canvas opened the session: the window that had it as a tab lets it go. */
  docked: (agentId: string) => void;
}

export const useSessionDockStore = create<SessionDockState>()((set) => ({
  pending: null,
  settle: (agentId) => set((state) => (state.pending === agentId ? { pending: null } : state)),
  docked: (agentId) => {
    set((state) => (state.pending === agentId ? { pending: null } : state));
    postSessionMessage({ type: "taken", agentId, by: thisWindowId() });
  },
}));

export function requestDock(agentId: string): void {
  useSessionDockStore.setState({ pending: agentId });
}
