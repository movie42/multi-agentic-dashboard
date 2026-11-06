import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { moveCard } from "@/common/todos/board";
import type { TodoAgentResponse, TodoAgentTurn } from "@/common/todos/agentTurn";
import type { TodoOp } from "@/common/todos/ops";
import type { TodoBoard, TodoResponse } from "@/common/todos/types";
import { readJson } from "@/client/shared/api/json";
import { toastError } from "@/client/shared/model/toastStore";

export const TODO_POLL_MS = 4000;

export const todoKeys = {
  all: ["todos"] as const,
  board: () => [...todoKeys.all, "board"] as const,
};

async function fetchTodoBoard(signal: AbortSignal): Promise<TodoBoard> {
  const response = await fetch("/api/todos", { cache: "no-store", signal });
  const payload = await readJson<TodoResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.board;
}

export async function postTodoOp(op: TodoOp): Promise<{ board: TodoBoard; createdId?: string }> {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(op),
  });
  const payload = await readJson<TodoResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return { board: payload.board, createdId: payload.createdId };
}

export function todoBoardQueryOptions() {
  return queryOptions({
    queryKey: todoKeys.board(),
    queryFn: ({ signal }) => fetchTodoBoard(signal),
    refetchInterval: TODO_POLL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Moves and hides show at once; every other op waits for the server's board. */
function optimistic(board: TodoBoard, op: TodoOp): TodoBoard {
  if (op.type === "card-move") return moveCard(board, op.cardId, op.statusId, Date.now());
  if (op.type === "card-hide") {
    return { ...board, cards: board.cards.map((card) => (card.id === op.cardId ? { ...card, hidden: op.hidden } : card)) };
  }
  return board;
}

export function useTodoOp() {
  const queryClient = useQueryClient();
  const key = todoKeys.board();
  const mutation = useMutation({
    mutationFn: postTodoOp,
    onMutate: async (op: TodoOp) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TodoBoard>(key);
      if (previous) queryClient.setQueryData<TodoBoard>(key, optimistic(previous, op));
      return { previous };
    },
    onError: (error, op, context) => {
      if (context?.previous) queryClient.setQueryData<TodoBoard>(key, context.previous);
      toastError("todos", error, { type: op.type });
    },
    onSuccess: ({ board }) => {
      queryClient.setQueryData<TodoBoard>(key, board);
    },
  });
  return {
    /** Resolves to null when the server refused the op; the toast has already told the user. */
    run: async (op: TodoOp): Promise<{ createdId?: string } | null> => {
      try {
        return { createdId: (await mutation.mutateAsync(op)).createdId };
      } catch {
        return null;
      }
    },
    pending: mutation.isPending,
  };
}

export async function sendTodoAgentMessage(request: { conversationId: string | null; message: string }): Promise<TodoAgentTurn> {
  const response = await fetch("/api/todos/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson<TodoAgentResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return { conversationId: payload.conversationId, reply: payload.reply, changes: payload.changes, failures: payload.failures };
}
