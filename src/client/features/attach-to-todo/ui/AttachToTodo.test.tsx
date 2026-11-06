import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBoard } from "@/common/todos/board";
import { applyTodoOp, todoOpSchema } from "@/common/todos/ops";
import type { TodoBoard } from "@/common/todos/types";
import { AttachToTodo } from "./AttachToTodo";

const SESSION = "0b8c1a7e-1234-4abc-8def-0123456789ab";
let board: TodoBoard;

function fakeServer(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.method === "POST") {
    const result = applyTodoOp(board, todoOpSchema.parse(JSON.parse(String(init.body))), { now: 1, newId: () => "new" });
    board = result.board;
    return Promise.resolve(new Response(JSON.stringify({ ok: true, board, createdId: result.createdId })));
  }
  return Promise.resolve(new Response(JSON.stringify({ ok: true, board })));
}

function renderButton() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AttachToTodo target={{ sessionId: SESSION, title: "세션 제목", repo: "repo", worktreePath: "/w" }} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  board = applyTodoOp(defaultBoard(), { type: "card-create", title: "있던 카드" }, { now: 1, newId: () => "c1" }).board;
  vi.stubGlobal("fetch", vi.fn(fakeServer));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AttachToTodo", () => {
  it("attaches the session to a picked card and then shows that card's name", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "할일에 붙이기" }));
    await user.click(await screen.findByRole("button", { name: "있던 카드" }));
    expect(await screen.findByRole("button", { name: "할일 · 있던 카드" })).toBeTruthy();
    expect(board.cards[0]?.sessionIds).toEqual([SESSION]);
  });

  it("makes a new card carrying the session, project and worktree", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "할일에 붙이기" }));
    await user.click(screen.getByRole("button", { name: "새 카드로 만들기" }));
    await waitFor(() => expect(board.cards).toHaveLength(2));
    expect(board.cards[1]).toMatchObject({ title: "세션 제목", repo: "repo", worktreePath: "/w", sessionIds: [SESSION] });
  });
});
