import { describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "@/common/orca/types";
import { defaultBoard } from "@/common/todos/board";
import { applyTodoOp, type TodoOp } from "@/common/todos/ops";
import type { TodoBoard } from "@/common/todos/types";
import type { ScannedSession } from "@/server/sessions/summarize";
import { agentCard } from "../../../test/fixtures";
import { searchSessions, TodoAgent, type RunTodoAgent } from "./TodoAgent";

const S1 = "0b8c1a7e-1234-4abc-8def-0123456789ab";
const S2 = "1b8c1a7e-1234-4abc-8def-0123456789ab";
const CONV = "2b8c1a7e-1234-4abc-8def-0123456789ab";
const PAST = "3b8c1a7e-1234-4abc-8def-0123456789ab";

function session(id: string) {
  return { id, title: "세션", titleSource: "ai" as const, bookmark: null };
}

function boardHolding(sessionId: string): TodoBoard {
  return {
    ...defaultBoard(),
    cards: [
      {
        id: "c1",
        title: "기존",
        memo: "",
        statusId: "st-todo",
        jira: [],
        sessionIds: [sessionId],
        repo: null,
        worktreePath: null,
        hidden: false,
        agentMovedAt: null,
        doneSuggestedAt: null,
        pendingLaunch: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  };
}

function scanned(overrides: Partial<ScannedSession>): ScannedSession {
  return {
    sessionId: PAST,
    title: "지난 세션",
    titleSource: "ai",
    cwd: "/tmp/gift",
    project: "shop",
    cwdExists: true,
    gitBranch: "feat/gift",
    firstPrompt: null,
    lastPrompt: null,
    lastMessage: null,
    startedAt: null,
    updatedAt: 1,
    sizeBytes: 1,
    origin: "human",
    ...overrides,
  };
}

function worktree(path: string, repo: string): WorktreeSummary {
  return {
    worktreeId: path,
    repo,
    name: "gift",
    branch: null,
    path,
    parentWorktreeId: null,
    unread: false,
    lastActivityAt: null,
    flowTasks: [],
    otherFlowTasks: [],
    pullRequest: { kind: "none" },
    featureId: null,
  };
}

/** An in-memory stand-in for TodoStore that applies ops with the real board rules. */
function memoryTodos(initial: TodoBoard) {
  let board = initial;
  let next = 0;
  return {
    get board() {
      return board;
    },
    read: async () => board,
    apply: async (op: TodoOp) => {
      const result = applyTodoOp(board, op, {
        now: 1,
        newId: () => `new-${++next}`,
      });
      board = result.board;
      return result;
    },
  };
}

function reply(ops: unknown[], search: string[] = []) {
  return { conversationId: CONV, output: { reply: "ok", search, ops } };
}

function agentWith(todos: ReturnType<typeof memoryTodos>, runAgent: RunTodoAgent, deps: Partial<ConstructorParameters<typeof TodoAgent>[0]> = {}) {
  return new TodoAgent({
    loadBoard: async () => ({ agents: [], worktrees: [] }),
    listSessions: async () => [],
    todos,
    runAgent,
    ...deps,
  });
}

describe("searchSessions", () => {
  it("ranks by matched keywords, then recency, and skips headless runs", () => {
    const sessions = [
      scanned({
        sessionId: "a",
        title: "선물하기 화면",
        cwd: "/x",
        gitBranch: "main",
        updatedAt: 1,
      }),
      scanned({ sessionId: "b", title: "선물하기 gift 결제", updatedAt: 0 }),
      scanned({
        sessionId: "c",
        title: "선물하기",
        origin: "headless",
        updatedAt: 9,
      }),
      scanned({
        sessionId: "d",
        title: "주문",
        gitBranch: "main",
        cwd: "/x",
        updatedAt: 9,
      }),
    ];
    expect(searchSessions(sessions, ["선물하기", "GIFT"]).map((each) => each.sessionId)).toEqual(["b", "a"]);
  });
});

describe("TodoAgent", () => {
  it("opens with the board and the open sessions no card holds, then applies the ops it returns", async () => {
    const todos = memoryTodos(boardHolding(S1));
    const runAgent = vi.fn(async (prompt: string) => {
      const block: { cards: { id: string }[]; openSessions: { id: string }[] } = JSON.parse(prompt.split("<board>")[1]?.split("</board>")[0] ?? "{}");
      expect(block.cards.map((card) => card.id)).toEqual(["c1"]);
      expect(block.openSessions.map((each) => each.id)).toEqual([S2]);
      return reply([
        {
          type: "card-create",
          title: "새 일",
          statusId: "st-progress",
          sessionIds: [S2],
        },
      ]);
    });
    const agent = agentWith(todos, runAgent, {
      loadBoard: async () => ({
        agents: [agentCard({ session: session(S1) }), agentCard({ id: "pane-2", session: session(S2) }), agentCard({ id: "pane-3" })],
        worktrees: [],
      }),
    });
    const result = await agent.send({
      conversationId: null,
      message: "카드로 만들어 줘",
    });
    expect(result.changes).toEqual(["새 카드 ‘새 일’ (진행 중 · 세션 1개)"]);
    expect(todos.board.cards.at(-1)).toMatchObject({
      title: "새 일",
      statusId: "st-progress",
      sessionIds: [S2],
      repo: "repo",
      worktreePath: "/tmp/wt",
    });
  });

  it("edits, moves and deletes cards, keeping going past a refused step", async () => {
    const todos = memoryTodos(boardHolding(S1));
    const agent = agentWith(
      todos,
      vi.fn(async () =>
        reply([
          {
            type: "card-update",
            cardId: "c1",
            title: "고친 제목",
            jiraUrls: ["https://x.atlassian.net/browse/AB-1"],
          },
          { type: "card-move", cardId: "ghost", statusId: "st-done" },
          { type: "card-move", cardId: "c1", statusId: "st-done" },
          { type: "session-detach", cardId: "c1", sessionId: S1 },
        ]),
      ),
    );
    const result = await agent.send({
      conversationId: null,
      message: "고쳐 줘",
    });
    expect(result.changes).toEqual([
      "‘기존’ 수정: 제목 → ‘고친 제목’ · 지라",
      "‘고친 제목’ 할일 → 끝",
      "‘고친 제목’에서 세션 ‘S1’ 뗌".replace("S1", S1.slice(0, 8)),
    ]);
    expect(result.failures).toEqual([{ summary: "‘ghost’ ? → 끝", error: "카드를 찾을 수 없어요" }]);
    expect(todos.board.cards[0]).toMatchObject({
      title: "고친 제목",
      statusId: "st-done",
      sessionIds: [],
      jira: [{ key: "AB-1" }],
    });

    const deleting = agentWith(
      todos,
      vi.fn(async () => reply([{ type: "card-delete", cardId: "c1" }])),
    );
    await deleting.send({ conversationId: null, message: "지워 줘" });
    expect(todos.board.cards).toEqual([]);
  });

  it("puts Jira links on a new card once it exists", async () => {
    const todos = memoryTodos(defaultBoard());
    const agent = agentWith(
      todos,
      vi.fn(async () =>
        reply([
          {
            type: "card-create",
            title: "지라 일",
            jiraUrls: ["https://x.atlassian.net/browse/AB-2"],
          },
        ]),
      ),
    );
    await agent.send({ conversationId: null, message: "만들어 줘" });
    expect(todos.board.cards[0]?.jira.map((jira) => jira.key)).toEqual(["AB-2"]);
  });

  it("searches past sessions and ignores ops sent alongside a search", async () => {
    const todos = memoryTodos(defaultBoard());
    const runAgent = vi
      .fn()
      .mockResolvedValueOnce(reply([{ type: "card-create", title: "너무 이름" }], ["선물하기"]))
      .mockImplementationOnce(async (prompt: string, conversationId: string | null) => {
        expect(conversationId).toBe(CONV);
        expect(prompt).toContain("<search-results");
        expect(prompt).toContain(PAST);
        return reply([
          {
            type: "card-create",
            title: "선물하기 남은 일",
            statusId: "st-todo",
            sessionIds: [PAST],
          },
        ]);
      });
    const agent = agentWith(todos, runAgent, {
      loadBoard: async () => ({
        agents: [],
        worktrees: [worktree("/tmp/gift", "shop-repo")],
      }),
      listSessions: async () => [scanned({ title: "선물하기 결제 붙이기", cwd: "/tmp/gift/apps/web" })],
    });
    await agent.send({
      conversationId: null,
      message: "선물하기 세션 모아 줘",
    });
    expect(todos.board.cards).toHaveLength(1);
    expect(todos.board.cards[0]).toMatchObject({
      title: "선물하기 남은 일",
      sessionIds: [PAST],
      repo: "shop-repo",
      worktreePath: "/tmp/gift",
    });
  });

  it("stops searching after three rounds", async () => {
    const runAgent = vi.fn(async () => reply([], ["x1"]));
    await agentWith(memoryTodos(defaultBoard()), runAgent).send({
      conversationId: null,
      message: "찾아 줘",
    });
    expect(runAgent).toHaveBeenCalledTimes(4);
  });

  it("keeps sessions found earlier attachable on later turns and refuses unknown ones", async () => {
    const todos = memoryTodos(defaultBoard());
    const runAgent = vi
      .fn()
      .mockResolvedValueOnce(reply([], ["선물하기"]))
      .mockResolvedValueOnce(reply([]))
      .mockImplementationOnce(async (prompt: string) => {
        expect(prompt).toContain("<board>");
        expect(prompt).not.toContain("openSessions");
        return reply([
          { type: "card-create", title: "x", sessionIds: [PAST] },
          { type: "card-create", title: "y", sessionIds: [S2] },
        ]);
      });
    const sessions = [scanned({ title: "선물하기" })];
    const agent = agentWith(todos, runAgent, {
      listSessions: async () => sessions,
    });
    await agent.send({ conversationId: null, message: "찾아 줘" });
    sessions.length = 0;
    const second = await agent.send({
      conversationId: CONV,
      message: "카드로",
    });
    expect(todos.board.cards.map((card) => card.sessionIds)).toEqual([[PAST]]);
    expect(second.failures.map((failure) => failure.error)).toEqual([`모르는 세션이에요: ${S2}`]);
  });

  it("refuses a conversation it does not know", async () => {
    await expect(
      agentWith(memoryTodos(defaultBoard()), vi.fn()).send({
        conversationId: CONV,
        message: "x",
      }),
    ).rejects.toThrow("만료");
  });
});
