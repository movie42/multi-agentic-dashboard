import { describe, expect, it } from "vitest";
import { describeAgentOp, prepareAgentSteps, type AgentSessionFact } from "./agentTurn";
import { defaultBoard } from "./board";
import type { TodoBoard } from "./types";

const S1 = "0b8c1a7e-1234-4abc-8def-0123456789ab";
const S2 = "1b8c1a7e-1234-4abc-8def-0123456789ab";
const HELD = "4b8c1a7e-1234-4abc-8def-0123456789ab";

function fact(id: string, overrides: Partial<AgentSessionFact> = {}): AgentSessionFact {
  return {
    id,
    open: true,
    cardId: null,
    repo: "repo",
    worktreeName: "wt",
    worktreePath: "/tmp/wt",
    branch: "feat/x",
    state: "working",
    title: "세션 제목",
    firstPrompt: null,
    lastPrompt: null,
    lastMessage: null,
    updatedAt: null,
    ...overrides,
  };
}

function boardWithCard(): TodoBoard {
  return {
    ...defaultBoard(),
    cards: [
      {
        id: "c1",
        title: "기존 카드",
        memo: "",
        statusId: "st-todo",
        jira: [],
        sessionIds: [HELD],
        repo: "repo",
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

describe("prepareAgentSteps", () => {
  it("fills a new card's project and worktree from its sessions and holds Jira links for a follow-up", () => {
    const { steps, failures } = prepareAgentSteps(
      {
        ops: [
          {
            type: "card-create",
            title: "로그인 고치기",
            statusId: "st-progress",
            sessionIds: [S1],
            jiraUrls: ["https://x.atlassian.net/browse/AB-1"],
          },
        ],
      },
      defaultBoard(),
      [fact(S1)],
    );
    expect(failures).toEqual([]);
    expect(steps).toEqual([
      {
        op: {
          type: "card-create",
          title: "로그인 고치기",
          statusId: "st-progress",
          sessionIds: [S1],
          repo: "repo",
          worktreePath: "/tmp/wt",
        },
        jiraUrls: ["https://x.atlassian.net/browse/AB-1"],
      },
    ]);
  });

  it("leaves the worktree empty when grouped sessions sit in different worktrees", () => {
    const { steps } = prepareAgentSteps({ ops: [{ type: "card-create", title: "묶음", sessionIds: [S1, S2] }] }, defaultBoard(), [
      fact(S1),
      fact(S2, { worktreePath: "/tmp/other" }),
    ]);
    expect(steps[0]?.op).toMatchObject({ repo: "repo", worktreePath: null });
  });

  it("makes every move a user move and splits a status on an update into a move", () => {
    const { steps } = prepareAgentSteps(
      {
        ops: [
          {
            type: "card-move",
            cardId: "c1",
            statusId: "st-done",
            source: "agent",
          },
          {
            type: "card-update",
            cardId: "c1",
            title: "새 제목",
            statusId: "st-progress",
          },
          { type: "card-update", cardId: "c1", statusId: "st-review" },
        ],
      },
      boardWithCard(),
      [],
    );
    expect(steps.map((step) => step.op)).toEqual([
      { type: "card-move", cardId: "c1", statusId: "st-done", source: "user" },
      { type: "card-update", cardId: "c1", title: "새 제목" },
      {
        type: "card-move",
        cardId: "c1",
        statusId: "st-progress",
        source: "user",
      },
      {
        type: "card-move",
        cardId: "c1",
        statusId: "st-review",
        source: "user",
      },
    ]);
  });

  it("refuses sessions the agent was not shown, ops outside the card set, and malformed ops", () => {
    const { steps, failures } = prepareAgentSteps(
      {
        ops: [
          { type: "session-attach", cardId: "c1", sessionId: S2 },
          { type: "session-detach", cardId: "c1", sessionId: HELD },
          { type: "status-delete", statusId: "st-review" },
          { type: "card-create", title: "" },
          "x",
        ],
      },
      boardWithCard(),
      [],
    );
    expect(steps.map((step) => step.op.type)).toEqual(["session-detach"]);
    expect(failures.map((failure) => failure.error)).toEqual([
      `모르는 세션이에요: ${S2}`,
      "보드가 받을 수 없는 변경이에요",
      "보드가 받을 수 없는 변경이에요",
    ]);
  });

  it("returns nothing for output that is not the schema", () => {
    expect(prepareAgentSteps(null, defaultBoard(), []).steps).toEqual([]);
    expect(prepareAgentSteps({ ops: "x" }, defaultBoard(), []).steps).toEqual([]);
  });
});

describe("describeAgentOp", () => {
  const title = () => "세션 제목";

  it("names the card, the fields and the statuses", () => {
    const board = boardWithCard();
    expect(describeAgentOp(board, { type: "card-move", cardId: "c1", statusId: "st-progress" }, title)).toBe("‘기존 카드’ 할일 → 진행 중");
    expect(describeAgentOp(board, { type: "card-update", cardId: "c1", memo: "m", repo: null }, title)).toBe(
      "‘기존 카드’ 수정: 메모 · 프로젝트 → 없음",
    );
    expect(describeAgentOp(board, { type: "card-create", title: "새 일", sessionIds: [S1] }, title)).toBe("새 카드 ‘새 일’ (할일 · 세션 1개)");
    expect(describeAgentOp(board, { type: "session-attach", cardId: "c1", sessionId: S1 }, title)).toBe("‘기존 카드’에 세션 ‘세션 제목’ 붙임");
    expect(describeAgentOp(board, { type: "card-delete", cardId: "c1" }, title)).toBe("‘기존 카드’ 삭제");
  });
});
