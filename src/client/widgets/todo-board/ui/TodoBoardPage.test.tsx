import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBoard } from "@/common/todos/board";
import { applyTodoOp, todoOpSchema, type TodoOp } from "@/common/todos/ops";
import type { TodoBoard } from "@/common/todos/types";
import { TodoBoardPage } from "./TodoBoardPage";

let board: TodoBoard;
let posted: TodoOp[];

function fakeServer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url === "/api/todos" && init?.method === "POST") {
    const op = todoOpSchema.parse(JSON.parse(String(init.body)));
    posted.push(op);
    let n = board.cards.length;
    const result = applyTodoOp(board, op, { now: 1, newId: () => `card-${++n}` });
    board = result.board;
    return Promise.resolve(new Response(JSON.stringify({ ok: true, board, createdId: result.createdId })));
  }
  if (url === "/api/todos") return Promise.resolve(new Response(JSON.stringify({ ok: true, board })));
  return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "unexpected" })));
}

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TodoBoardPage repos={[]} agents={[]} worktrees={[]} now={1} onAction={() => undefined} />
    </QueryClientProvider>,
  );
}

function dataTransfer() {
  const data = new Map<string, string>();
  return {
    types: [] as string[],
    effectAllowed: "",
    dropEffect: "",
    setData(type: string, value: string) {
      data.set(type, value);
      this.types.push(type);
    },
    getData: (type: string) => data.get(type) ?? "",
  };
}

const column = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  board = defaultBoard();
  posted = [];
  vi.stubGlobal("fetch", vi.fn(fakeServer));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodoBoardPage", () => {
  it("creates a card in the column where it was typed", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await within(await screen.findByRole("region", { name: "할일" })).findByRole("button", { name: "+ 카드" }));
    await user.type(screen.getByRole("textbox", { name: "새 카드 제목" }), "로그인 화면{Enter}");
    expect(await within(column("할일")).findByRole("button", { name: "로그인 화면" })).toBeTruthy();
    expect(posted[0]).toMatchObject({ type: "card-create", title: "로그인 화면", statusId: "st-todo" });
  });

  it("hides the review column and moves a dragged card to the first status of the drop column", async () => {
    board = applyTodoOp(board, { type: "card-create", title: "드래그" }, { now: 1, newId: () => "c1" }).board;
    renderPage();
    const card = await screen.findByRole("button", { name: "드래그" });
    expect(screen.queryByRole("region", { name: "리뷰" })).toBeNull();
    const transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(column("진행 중"), { dataTransfer: transfer });
    fireEvent.drop(column("진행 중"), { dataTransfer: transfer });
    expect(await within(column("진행 중")).findByRole("button", { name: "드래그" })).toBeTruthy();
    expect(posted).toEqual([{ type: "card-move", cardId: "c1", statusId: "st-progress" }]);
  });

  it("saves a markdown memo from the card detail and shows it rendered", async () => {
    board = applyTodoOp(board, { type: "card-create", title: "메모" }, { now: 1, newId: () => "c1" }).board;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "메모" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "메모 편집" }));
    await user.type(within(dialog).getByRole("textbox", { name: "메모" }), "**굵게** 쓴 메모");
    await user.click(within(dialog).getByRole("button", { name: "메모 저장" }));
    await waitFor(() => expect(within(dialog).getByText("굵게").tagName).toBe("STRONG"));
    expect(board.cards[0]?.memo).toBe("**굵게** 쓴 메모");
  });

  it("folds a hidden card under the column's hidden-cards toggle", async () => {
    board = applyTodoOp(board, { type: "card-create", title: "숨길 카드" }, { now: 1, newId: () => "c1" }).board;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "숨길 카드" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "숨기기" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(within(column("할일")).queryByRole("button", { name: "숨길 카드" })).toBeNull());
    await user.click(within(column("할일")).getByRole("button", { name: "숨긴 카드 보기 1" }));
    expect(within(column("할일")).getByRole("button", { name: "숨길 카드" })).toBeTruthy();
  });
});

describe("TodoBoardPage inputs", () => {
  beforeEach(() => {
    board = defaultBoard();
    posted = [];
    vi.stubGlobal("fetch", vi.fn(fakeServer));
  });

  it("drops a typed card title when Escape cancels the input", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await within(await screen.findByRole("region", { name: "할일" })).findByRole("button", { name: "+ 카드" }));
    await user.type(screen.getByRole("textbox", { name: "새 카드 제목" }), "버릴 제목{Escape}");
    await user.click(document.body);
    expect(posted).toEqual([]);
  });
});

describe("TodoBoardPage workflow", () => {
  beforeEach(() => {
    board = defaultBoard();
    posted = [];
    vi.stubGlobal("fetch", vi.fn(fakeServer));
  });

  it("edits which statuses an agent may move to next", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "워크플로" }));
    const dialog = screen.getByRole("dialog");
    const fromTodo = within(dialog).getByRole("group", { name: "할일에서 갈 수 있는 상태" });
    await user.click(within(fromTodo).getByRole("checkbox", { name: "리뷰" }));
    expect(posted).toEqual([{ type: "status-update", statusId: "st-todo", next: ["st-progress", "st-review"] }]);
    await waitFor(() => expect(within(fromTodo).getByRole("checkbox", { name: "리뷰" })).toHaveProperty("checked", true));
  });

  it("moves a card the agent suggested to the last status when the person confirms", async () => {
    board = applyTodoOp(board, { type: "card-create", title: "제안", statusId: "st-progress" }, { now: 1, newId: () => "c1" }).board;
    board = applyTodoOp(board, { type: "card-suggest-done", cardId: "c1" }, { now: 1, newId: () => "x" }).board;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "제안" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "끝 상태로 옮기기" }));
    await waitFor(() => expect(board.cards[0]).toMatchObject({ statusId: "st-done", doneSuggestedAt: null }));
  });
});
