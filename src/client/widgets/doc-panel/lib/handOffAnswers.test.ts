import { describe, expect, it } from "vitest";
import type { AgentCard } from "@/common/board/types";
import { handOffAnswers } from "./handOffAnswers";

const PAGE = "/w/repo/docs/auth/COMP-1/02-grill.html";

function agent(id: string, overrides: Partial<AgentCard>): AgentCard {
  return {
    id, worktreeId: "wt", repo: "repo", worktreeName: "wt", branch: null, worktreePath: "/w/repo", agentType: "claude",
    state: "done", prompt: null, title: null, session: null, lastMessage: null, toolName: null, backgroundRunning: false,
    interrupted: false, stateSince: null, updatedAt: 0, unread: false, terminalHandle: `t-${id}`, artifacts: [],
    parentId: null, model: null, contextPercent: null, permission: null, ...overrides,
  };
}

const owns = { artifacts: [{ target: "/w/repo/docs/auth/COMP-1/index.html", label: "x", kind: "html" as const }] };

describe("handOffAnswers", () => {
  it("sends to the newest live session that listed a page from the same task folder", () => {
    const agents = [agent("old", { ...owns, updatedAt: 1 }), agent("new", { ...owns, updatedAt: 2 }), agent("other", { updatedAt: 9 })];
    expect(handOffAnswers(agents, PAGE)).toMatchObject({ where: "session", action: { type: "send-prompt", terminalHandle: "t-new" } });
  });

  it("starts a flow session in the worktree when the document's session is closed", () => {
    const agents = [agent("closed", { ...owns, terminalHandle: null })];
    expect(handOffAnswers(agents, PAGE)).toMatchObject({ where: "new", action: { type: "launch-agent", worktreePath: "/w/repo" } });
  });

  it("has nowhere to send for pages that are not task pages", () => {
    expect(handOffAnswers([], "/w/repo/docs/auth/index.html")).toBeNull();
  });
});
