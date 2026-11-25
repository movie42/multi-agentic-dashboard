import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoAgentTurn } from "@/common/todos/agentTurn";
import { useTodoAgentStore } from "./todoAgentStore";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("todoAgentStore", () => {
  beforeEach(() => useTodoAgentStore.getState().reset());

  it("keeps the turn running and records the reply with no screen attached", async () => {
    const reply = deferred<TodoAgentTurn>();
    const transport = vi.fn(() => reply.promise);
    const settled = vi.fn();
    useTodoAgentStore.getState().send("카드 만들어 줘", { transport, onSettled: settled });

    expect(useTodoAgentStore.getState().pending).toBe(true);
    expect(useTodoAgentStore.getState().lines.map((line) => line.role)).toEqual(["user"]);
    expect(transport).toHaveBeenCalledWith({ conversationId: null, message: "카드 만들어 줘" });

    reply.resolve({ conversationId: "c1", reply: "만들었어요", changes: ["카드 A"], failures: [] });
    await vi.waitFor(() => expect(useTodoAgentStore.getState().pending).toBe(false));

    const state = useTodoAgentStore.getState();
    expect(state.conversationId).toBe("c1");
    expect(state.lines.map((line) => line.role)).toEqual(["user", "agent", "changes"]);
    expect(settled).toHaveBeenCalledOnce();
  });

  it("continues the same conversation on the next message", async () => {
    const transport = vi.fn(async () => ({ conversationId: "c1", reply: "네", changes: [], failures: [] }));
    useTodoAgentStore.getState().send("하나", { transport });
    await vi.waitFor(() => expect(useTodoAgentStore.getState().pending).toBe(false));
    useTodoAgentStore.getState().send("둘", { transport });
    expect(transport).toHaveBeenLastCalledWith({ conversationId: "c1", message: "둘" });
  });

  it("ignores a message while a turn is running", () => {
    const transport = vi.fn(() => new Promise<TodoAgentTurn>(() => {}));
    useTodoAgentStore.getState().send("하나", { transport });
    useTodoAgentStore.getState().send("둘", { transport });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("leaves a note when the agent fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("timeout");
    });
    useTodoAgentStore.getState().send("하나", { transport });
    await vi.waitFor(() => expect(useTodoAgentStore.getState().pending).toBe(false));
    expect(useTodoAgentStore.getState().lines.at(-1)).toMatchObject({ role: "note", text: "에이전트가 답하지 못했어요: timeout" });
  });
});
