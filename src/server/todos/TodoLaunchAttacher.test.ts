import { describe, expect, it } from "vitest";
import type { AgentState, BoardSnapshot, WorktreeSummary } from "@/common/orca/types";
import { defaultBoard } from "@/common/todos/board";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import type { PullRequestInfo } from "@/common/workflow/types";
import { agentCard } from "../../../test/fixtures";
import { PENDING_LAUNCH_TTL_MS, TodoLaunchAttacher } from "./TodoLaunchAttacher";

const S1 = "0b8c1a7e-1234-4abc-8def-0123456789ab";
const S2 = "1b8c1a7e-1234-4abc-8def-0123456789ab";

function card(overrides: Partial<TodoCard>): TodoCard {
  return {
    id: "c1",
    title: "c1",
    memo: "",
    statusId: "st-todo",
    jira: [],
    sessionIds: [],
    repo: null,
    worktreePath: null,
    hidden: false,
    agentMovedAt: null,
    doneSuggestedAt: null,
    pendingLaunch: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function worktree(path: string, pullRequest: PullRequestInfo): WorktreeSummary {
  return {
    worktreeId: path,
    repo: "repo",
    name: path,
    branch: "feat/x",
    path,
    isMain: false,
    parentWorktreeId: null,
    unread: false,
    lastActivityAt: null,
    flowTasks: [],
    otherFlowTasks: [],
    pullRequest,
    featureId: null,
  };
}

const openPr: PullRequestInfo = { kind: "found", number: 1, state: "OPEN", url: "u", isDraft: false };

function snapshot(at: number, agents: { session: string; state: AgentState; path?: string }[], pr: PullRequestInfo = { kind: "none" }): BoardSnapshot {
  return {
    fetchedAt: at,
    projects: [],
    features: [],
    worktrees: [worktree("/w", pr)],
    agents: agents.map((agent, index) =>
      agentCard({
        id: `pane-${index}`,
        worktreePath: agent.path ?? "/w",
        state: agent.state,
        session: { id: agent.session, title: null, titleSource: "none", bookmark: null },
      }),
    ),
  };
}

function memoryStore(initial: TodoBoard) {
  const box = { board: initial, writes: 0 };
  return {
    box,
    transact: async <T extends { board: TodoBoard }>(work: (board: TodoBoard) => T) => {
      const result = work(box.board);
      if (result.board !== box.board) box.writes += 1;
      box.board = result.board;
      return result;
    },
  };
}

const statusOfCard = (board: TodoBoard) => board.cards[0]?.statusId;

describe("TodoLaunchAttacher", () => {
  it("never moves cards when sessions start or PRs open", async () => {
    const store = memoryStore({ ...defaultBoard(), cards: [card({ sessionIds: [S1] })] });
    const mover = new TodoLaunchAttacher(store);
    await mover.observe(snapshot(1, [{ session: S1, state: "idle" }]));
    await mover.observe(snapshot(2, [{ session: S1, state: "working" }], openPr));
    expect(store.box.writes).toBe(0);
    expect(statusOfCard(store.box.board)).toBe("st-todo");
  });

  it("attaches the session a [새 세션] launch opened in the card's worktree", async () => {
    const pending = { worktreePath: "/w", at: 5 };
    const store = memoryStore({ ...defaultBoard(), cards: [card({ worktreePath: "/w", pendingLaunch: pending })] });
    const mover = new TodoLaunchAttacher(store);
    await mover.observe(snapshot(1, [{ session: S1, state: "idle" }]));
    await mover.observe(snapshot(6, [{ session: S1, state: "idle" }, { session: S2, state: "working" }]));
    expect(store.box.board.cards[0]).toMatchObject({ sessionIds: [S2], pendingLaunch: null, statusId: "st-todo" });
  });

  it("drops a pending launch nobody claimed after the time limit", async () => {
    const store = memoryStore({ ...defaultBoard(), cards: [card({ worktreePath: "/w", pendingLaunch: { worktreePath: "/w", at: 5 } })] });
    const mover = new TodoLaunchAttacher(store);
    await mover.observe(snapshot(1, []));
    await mover.observe(snapshot(6, []));
    expect(store.box.writes).toBe(0);
    await mover.observe(snapshot(6 + PENDING_LAUNCH_TTL_MS, []));
    expect(store.box.board.cards[0]?.pendingLaunch).toBeNull();
  });
});
