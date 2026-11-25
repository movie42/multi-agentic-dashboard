import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBoard } from "@/common/todos/board";
import { applyTodoOp, todoOpSchema, type TodoOp } from "@/common/todos/ops";
import type { TodoBoard } from "@/common/todos/types";
import { agentCard } from "../../../../../test/fixtures";
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
  if (url === "/api/todos/jira" && !init?.method) return Promise.resolve(new Response(JSON.stringify({ ok: true, statuses: { "AB-1": "진행 중" } })));
  return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "unexpected" })));
}

function renderPage(now = 1) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TodoBoardPage repos={[]} agents={[]} worktrees={[]} now={now} modeOf={() => "company"} onAction={async () => undefined} onJumpToAgent={() => undefined} />
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

const SPRINT_KEY = "agent-control:todo-sprint";
const VIEW_KEY = "agent-control:todo-view";

beforeEach(() => {
  board = defaultBoard();
  posted = [];
  window.localStorage.clear();
  // Most tests predate sprints and make cards with no deadline, which only the 전체 scope shows.
  window.localStorage.setItem(SPRINT_KEY, JSON.stringify(["all"]));
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

describe("TodoBoardPage sessions", () => {
  const SESSION = "0b8c1a7e-1234-4abc-8def-0123456789ab";

  beforeEach(() => {
    board = applyTodoOp(defaultBoard(), { type: "card-create", title: "세션 카드", sessionIds: [SESSION] }, { now: 1, newId: () => "c1" }).board;
    posted = [];
    vi.stubGlobal("fetch", vi.fn(fakeServer));
  });

  it("jumps to the live agent on the board instead of resuming the session", async () => {
    const agent = agentCard({ id: "pane-9", repo: "repo", state: "working", session: { id: SESSION, title: "작업 세션", titleSource: "custom", bookmark: null } });
    const onJump = vi.fn();
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TodoBoardPage repos={[]} agents={[agent]} worktrees={[]} now={1} modeOf={() => "company"} onAction={onAction} onJumpToAgent={onJump} />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "세션 카드" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "에이전트로 이동" }));
    expect(onJump).toHaveBeenCalledWith(agent);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("TodoBoardPage hub", () => {
  beforeEach(() => {
    board = defaultBoard();
    posted = [];
    vi.stubGlobal("fetch", vi.fn(fakeServer));
  });

  it("files a pasted Slack address as a link and a Jira address as a Jira chip with its status", async () => {
    board = applyTodoOp(board, { type: "card-create", title: "링크 카드" }, { now: 1, newId: () => "c1" }).board;
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "링크 카드" }));
    const input = within(screen.getByRole("dialog")).getByRole("textbox", { name: "지라 · 링크 주소" });
    await user.type(input, "https://x.slack.com/archives/C1/p2{Enter}");
    await user.type(input, "https://x.atlassian.net/browse/AB-1{Enter}");
    await waitFor(() => expect(posted.at(-1)).toMatchObject({ type: "card-update", jiraUrls: ["https://x.atlassian.net/browse/AB-1"] }));
    expect(posted).toContainEqual({ type: "card-update", cardId: "c1", linkUrls: ["https://x.slack.com/archives/C1/p2"] });
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("진행 중")).toBeTruthy());
    expect(within(dialog).getByText("#C1")).toBeTruthy();
  });

  it("keeps archived cards off the board and restores them from the archive list", async () => {
    board = applyTodoOp(board, { type: "card-create", title: "지난 일", statusId: "st-done" }, { now: 1, newId: () => "c1" }).board;
    board = { ...board, cards: board.cards.map((card) => ({ ...card, archivedAt: 2 })) };
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "아카이브 1" }));
    expect(screen.queryByRole("region", { name: "끝" }) && within(column("끝")).queryByRole("button", { name: "지난 일" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "아카이브 검색" }), "지난");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(posted).toContainEqual({ type: "card-restore", cardId: "c1" }));
    await user.keyboard("{Escape}");
    expect(await within(column("진행 중")).findByRole("button", { name: "지난 일" })).toBeTruthy();
  });
});

describe("TodoBoardPage sprints", () => {
  // 2026-11-25 is a Wednesday; with weeks starting Monday this sprint is 11/23–11/29.
  const NOW = new Date(2026, 10, 25, 12).getTime();

  function withCards(...cards: { title: string; dueDate?: string; startDate?: string; statusId?: string }[]) {
    let n = 0;
    board = cards.reduce(
      (acc, card) => applyTodoOp(acc, { type: "card-create", ...card }, { now: 1, newId: () => `c${++n}-${card.title}` }).board,
      board,
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows this sprint's cards on the kanban by default and switches to other sprints", async () => {
    const user = userEvent.setup();
    withCards({ title: "이번 주 일", dueDate: "2026-11-27" }, { title: "다음 주 일", dueDate: "2026-12-01" }, { title: "백로그 일" }, { title: "밀린 일", dueDate: "2026-11-18" });
    renderPage(NOW);
    expect(await screen.findByRole("button", { name: "이번 주 일" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "밀린 일" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다음 주 일" })).toBeNull();
    expect(screen.queryByRole("button", { name: "백로그 일" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^백로그/ }));
    expect(await screen.findByRole("button", { name: "백로그 일" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "이번 주 일" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^다음 주/ }));
    expect(await screen.findByRole("button", { name: "다음 주 일" })).toBeTruthy();
  });

  it("gives a card added under this sprint the sprint's last day", async () => {
    const user = userEvent.setup();
    renderPage(NOW);
    await user.click(await within(await screen.findByRole("region", { name: "할일" })).findByRole("button", { name: "+ 카드" }));
    await user.type(screen.getByRole("textbox", { name: "새 카드 제목" }), "새 일{Enter}");
    expect(posted[0]).toMatchObject({ type: "card-create", title: "새 일", dueDate: "2026-11-29" });
    expect(await within(column("할일")).findByRole("button", { name: "새 일" })).toBeTruthy();
  });

  it("changes the weekday sprints start on", async () => {
    const user = userEvent.setup();
    renderPage(NOW);
    await user.selectOptions(await screen.findByRole("combobox", { name: "스프린트 시작 요일" }), "3");
    expect(posted[0]).toEqual({ type: "settings-update", weekStartsOn: 3 });
  });

  it("shows one sprint week as a timeline with backlog chips and overdue rows on top", async () => {
    const user = userEvent.setup();
    withCards({ title: "금요일 일", dueDate: "2026-11-27" }, { title: "백로그 일" }, { title: "지난 주 일", dueDate: "2026-11-18" });
    renderPage(NOW);
    await user.click(await screen.findByRole("button", { name: "일정" }));
    expect(window.localStorage.getItem(VIEW_KEY)).toBe(JSON.stringify(["schedule"]));

    const rows = await screen.findByRole("list", { name: "이 주 카드" });
    const [first, second] = within(rows).getAllByRole("listitem");
    expect(within(first as HTMLElement).getByRole("button", { name: "지난 주 일" })).toBeTruthy();
    expect(within(first as HTMLElement).getByText("← 7일 지남 · 할일")).toBeTruthy();
    expect(within(second as HTMLElement).getByRole("button", { name: "금요일 일" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "백로그" })).getByRole("button", { name: "백로그 일" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /이번 주로 넘기기/ }));
    expect(posted.at(-1)).toEqual({ type: "cards-carry-over", cardIds: [board.cards.find((card) => card.title === "지난 주 일")?.id] });
  });

  it("goes back only as far as the earliest week holding a card", async () => {
    const user = userEvent.setup();
    withCards({ title: "지난 주 끝난 일", dueDate: "2026-11-18", statusId: "st-done" });
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(["schedule"]));
    renderPage(NOW);
    const back = await screen.findByRole("button", { name: "이전 주" });
    await user.click(back);
    expect(screen.getByRole("heading", { name: /지난 주/ })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "이 주 카드" })).getByRole("button", { name: "지난 주 끝난 일" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "이전 주" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("resizes the title column and the row height by dragging their edges, and remembers both", async () => {
    withCards({ title: "아주 긴 제목의 일", dueDate: "2026-11-25" });
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(["schedule"]));
    renderPage(NOW);
    const column = await screen.findByRole("separator", { name: "제목 칸 너비 조절" });
    fireEvent.pointerDown(column, { button: 0, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(column, { clientX: 220, clientY: 0 });
    fireEvent.pointerUp(column, { clientX: 220, clientY: 0 });
    expect(window.localStorage.getItem("agent-control:todo-title-w")).toBe(JSON.stringify(["360"]));

    const [row] = screen.getAllByRole("separator", { name: "줄 높이 조절" });
    if (!row) throw new Error("no row resizer");
    fireEvent.pointerDown(row, { button: 0, clientX: 0, clientY: 50 });
    fireEvent.pointerMove(row, { clientX: 0, clientY: 94 });
    fireEvent.pointerUp(row, { clientX: 0, clientY: 94 });
    expect(window.localStorage.getItem("agent-control:todo-row-h")).toBe(JSON.stringify(["80"]));
    expect(row.getAttribute("aria-valuenow")).toBe("80");

    fireEvent.keyDown(row, { key: "ArrowUp" });
    expect(window.localStorage.getItem("agent-control:todo-row-h")).toBe(JSON.stringify(["72"]));
    fireEvent.doubleClick(column);
    expect(window.localStorage.getItem("agent-control:todo-title-w")).toBe(JSON.stringify(["240"]));
  });

  it("stays on this week when no card is older", async () => {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(["schedule"]));
    renderPage(NOW);
    expect(((await screen.findByRole("button", { name: "이전 주" })) as HTMLButtonElement).disabled).toBe(true);
  });

  it("drops a backlog chip on a day as its deadline and a row on the backlog to clear its dates", async () => {
    const user = userEvent.setup();
    withCards({ title: "정할 일" });
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(["schedule"]));
    renderPage(NOW);
    const chip = within(await screen.findByRole("region", { name: "백로그" })).getByRole("button", { name: "정할 일" });
    expect(chip.getAttribute("data-todo-chip")).toBe(board.cards[0]?.id);

    const transfer = dataTransfer();
    fireEvent.dragStart(chip, { dataTransfer: transfer });
    const thursday = screen.getByRole("listitem", { name: "11/26(목)" });
    fireEvent.dragOver(thursday, { dataTransfer: transfer });
    fireEvent.drop(thursday, { dataTransfer: transfer });
    await waitFor(() => expect(posted.at(-1)).toEqual({ type: "card-update", cardId: board.cards[0]?.id, dueDate: "2026-11-26" }));

    const row = await within(screen.getByRole("list", { name: "이 주 카드" })).findByRole("button", { name: "정할 일" });
    const back = dataTransfer();
    fireEvent.dragStart(row, { dataTransfer: back });
    const backlog = screen.getByRole("region", { name: "백로그" });
    fireEvent.dragOver(backlog, { dataTransfer: back });
    fireEvent.drop(backlog, { dataTransfer: back });
    await waitFor(() => expect(posted.at(-1)).toEqual({ type: "card-update", cardId: board.cards[0]?.id, startDate: null, dueDate: null }));

    await user.click(within(screen.getByRole("region", { name: "백로그" })).getByRole("button", { name: "정할 일" }));
    expect(((await screen.findByRole("textbox", { name: "카드 제목" })) as HTMLInputElement).value).toBe("정할 일");
  });

  it("drags a bar's end to move the deadline and a deadline mark's handle to add a start day", async () => {
    withCards({ title: "기간 일", startDate: "2026-11-23", dueDate: "2026-11-24" }, { title: "점 일", dueDate: "2026-11-27" });
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(["schedule"]));
    renderPage(NOW);
    const schedule = await screen.findByRole("region", { name: "일정" });
    // jsdom lays nothing out, so one day column is 1px wide here.
    fireEvent.pointerDown(screen.getByLabelText("기간 일 마감일 바꾸기"), { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(schedule, { clientX: 12, pointerId: 1 });
    fireEvent.pointerUp(schedule, { clientX: 12, pointerId: 1 });
    await waitFor(() => expect(posted.at(-1)).toEqual({ type: "card-update", cardId: board.cards[0]?.id, dueDate: "2026-11-26" }));

    fireEvent.pointerDown(screen.getByLabelText("점 일 시작일 만들기"), { clientX: 10, pointerId: 2 });
    fireEvent.pointerMove(schedule, { clientX: 6, pointerId: 2 });
    fireEvent.pointerUp(schedule, { clientX: 6, pointerId: 2 });
    await waitFor(() => expect(posted.at(-1)).toEqual({ type: "card-update", cardId: board.cards[1]?.id, startDate: "2026-11-23" }));
  });
});
