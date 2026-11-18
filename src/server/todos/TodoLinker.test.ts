import { describe, expect, it, vi } from "vitest";
import type { AgentCard, BoardSnapshot, WorktreeSummary } from "@/common/board/types";
import { defaultBoard } from "@/common/todos/board";
import type { TodoBoard } from "@/common/todos/types";
import type { ScannedSession } from "@/server/sessions/summarize";
import { TodoLinker } from "./TodoLinker";

vi.mock("server-only", () => ({}));

function memoryStore(initial: TodoBoard) {
  const box = { board: initial };
  return {
    box,
    transact: async <T extends { board: TodoBoard }>(work: (board: TodoBoard) => T) => {
      const result = work(box.board);
      box.board = result.board;
      return result;
    },
  };
}

const worktree = { path: "/repo/wt", repo: "repo", name: "AB-7-login", branch: "feat/AB-7", isMain: false } as WorktreeSummary;
const main = { path: "/repo", repo: "repo", name: "repo", branch: "main", isMain: true } as WorktreeSummary;

function snapshot(agents: Partial<AgentCard>[]): BoardSnapshot {
  return { fetchedAt: 0, projects: [], worktrees: [worktree, main], features: [], agents: agents as AgentCard[] };
}

describe("TodoLinker", () => {
  it("links the Jira card to its worktree, then attaches open and past sessions there", async () => {
    const base = defaultBoard();
    const store = memoryStore({
      ...base,
      cards: [
        {
          id: "c1", title: "로그인", memo: "", statusId: "st-todo", jira: [{ key: "AB-7", url: "u" }], links: [], sessionIds: [],
          ignoredSessionIds: [], repo: null, worktreePath: null, hidden: false, agentMovedAt: null, doneSuggestedAt: null,
          pendingLaunch: null, doneAt: null, archivedAt: null, origin: "jira", createdAt: 0, updatedAt: 0,
        },
      ],
    });
    const past = [{ sessionId: "old", cwd: "/repo/wt", gitBranch: "feat/AB-7", origin: "human" } as ScannedSession];
    const linker = new TodoLinker(store, async () => past, () => 1);
    await linker.observe(snapshot([{ session: { id: "live", title: null, titleSource: "none", bookmark: null }, worktreePath: "/repo/wt", branch: "feat/AB-7" }]));
    expect(store.box.board.cards[0]).toMatchObject({ worktreePath: "/repo/wt", repo: "repo", sessionIds: ["live", "old"] });
  });
});
