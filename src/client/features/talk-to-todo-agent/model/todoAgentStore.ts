import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentFailure, TodoAgentTurn } from "@/common/todos/agentTurn";
import { sendTodoAgentMessage } from "@/client/entities/todo";
import { errorMessage } from "@/client/shared/model/errorMessage";

export type ChatLine =
  | { id: number; role: "user" | "agent" | "note"; text: string }
  | { id: number; role: "changes"; changes: string[]; failures: AgentFailure[] };

type WithoutId<Line> = Line extends ChatLine ? Omit<Line, "id"> : never;
type NewLine = WithoutId<ChatLine>;

interface SendOptions {
  transport?: (request: { conversationId: string | null; message: string }) => Promise<TodoAgentTurn>;
  /** Runs after the turn ends, whether or not any screen still shows the conversation. */
  onSettled?: () => void;
}

interface TodoAgentState {
  conversationId: string | null;
  lines: ChatLine[];
  nextId: number;
  pending: boolean;
  /** Open sessions no card holds, as the to-do board counted them when it opened the agent. */
  sessionCount: number;
  setSessionCount: (count: number) => void;
  send: (text: string, options?: SendOptions) => void;
  reset: () => void;
}

const INITIAL = { conversationId: null, lines: [], nextId: 0, pending: false, sessionCount: 0 };

// The turn lives here, not in a component, so leaving the to-do screen or closing the tab does not lose it.
export const useTodoAgentStore = create<TodoAgentState>()(
  persist(
    (set, get) => {
      const append = (...added: NewLine[]) =>
        set((state) => ({
          lines: [...state.lines, ...added.map((line, index): ChatLine => ({ ...line, id: state.nextId + index }))],
          nextId: state.nextId + added.length,
        }));

      return {
        ...INITIAL,
        setSessionCount: (sessionCount) => set({ sessionCount }),
        send: (text, { transport = sendTodoAgentMessage, onSettled } = {}) => {
          const message = text.trim();
          if (!message || get().pending) return;
          append({ role: "user", text: message });
          set({ pending: true });
          transport({ conversationId: get().conversationId, message })
            .then((turn) => {
              set({ conversationId: turn.conversationId });
              append(
                { role: "agent", text: turn.reply },
                ...(turn.changes.length > 0 || turn.failures.length > 0
                  ? [{ role: "changes" as const, changes: turn.changes, failures: turn.failures }]
                  : []),
              );
            })
            .catch((error: unknown) => append({ role: "note", text: `에이전트가 답하지 못했어요: ${errorMessage(error)}` }))
            .finally(() => {
              set({ pending: false });
              onSettled?.();
            });
        },
        reset: () => set(INITIAL),
      };
    },
    {
      name: "agent-control:todo-agent",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      // A reload drops the request in flight, so `pending` is not kept.
      partialize: (state) => ({ conversationId: state.conversationId, lines: state.lines, nextId: state.nextId, sessionCount: state.sessionCount }),
      skipHydration: true,
    },
  ),
);
