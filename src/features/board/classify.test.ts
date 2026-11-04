import { describe, expect, it } from "vitest";
import { agentCard } from "../../../test/fixtures";
import { awaitsUser, foldWorkers, groupAgents } from "./classify";

const permission = {
  id: "p",
  paneKey: "pane",
  receivedAt: 0,
  toolName: "Bash",
  toolInput: {},
  suggestions: [],
  transcriptPath: "",
};

describe("awaitsUser", () => {
  it.each([
    ["working", false, false],
    ["idle", false, false],
    ["idle", true, true],
    ["done", false, true],
    ["blocked", false, true],
    ["waiting", false, true],
  ] as const)("%s interrupted=%s → %s", (state, interrupted, expected) => {
    expect(awaitsUser(agentCard({ state, interrupted }))).toBe(expected);
  });
});

describe("groupAgents", () => {
  it("splits by state and honors dismissal", () => {
    const working = agentCard({ id: "w", state: "working" });
    const done = agentCard({ id: "d", state: "done" });
    const dismissed = agentCard({ id: "x", state: "done" });
    const idle = agentCard({ id: "i", state: "idle" });
    const groups = groupAgents([working, done, dismissed, idle], (agent) => agent.id === "x");
    expect(groups.working.map((a) => a.id)).toEqual(["w"]);
    expect(groups.needsMe.map((a) => a.id)).toEqual(["d"]);
    expect(groups.resting.map((a) => a.id).sort()).toEqual(["i", "x"]);
  });

  it("orders needsMe by urgency then oldest state", () => {
    const agents = [
      agentCard({ id: "unread", state: "done", unread: true, stateSince: 1 }),
      agentCard({ id: "plain", state: "done", stateSince: 0 }),
      agentCard({ id: "blocked-new", state: "blocked", stateSince: 50 }),
      agentCard({ id: "blocked-old", state: "waiting", stateSince: 10 }),
      agentCard({ id: "interrupted", state: "idle", interrupted: true, stateSince: 5 }),
    ];
    expect(groupAgents(agents, () => false).needsMe.map((a) => a.id)).toEqual([
      "blocked-old",
      "blocked-new",
      "interrupted",
      "unread",
      "plain",
    ]);
  });

  it("orders working by oldest state with null last, resting by most recent update", () => {
    const groups = groupAgents(
      [
        agentCard({ id: "w-null", state: "working", stateSince: null }),
        agentCard({ id: "w-2", state: "working", stateSince: 2 }),
        agentCard({ id: "w-1", state: "working", stateSince: 1 }),
        agentCard({ id: "r-old", state: "idle", updatedAt: 1 }),
        agentCard({ id: "r-new", state: "idle", updatedAt: 9 }),
      ],
      () => false,
    );
    expect(groups.working.map((a) => a.id)).toEqual(["w-1", "w-2", "w-null"]);
    expect(groups.resting.map((a) => a.id)).toEqual(["r-new", "r-old"]);
  });
});

describe("foldWorkers", () => {
  it("folds workers under a coordinator on the board", () => {
    const coordinator = agentCard({ id: "c" });
    const worker = agentCard({ id: "w", parentId: "c" });
    const orphan = agentCard({ id: "o", parentId: "gone" });
    const folded = foldWorkers([coordinator, worker, orphan]);
    expect(folded.top.map((a) => a.id)).toEqual(["c", "o"]);
    expect([...folded.foldedIds]).toEqual(["w"]);
    expect(folded.workersOf(coordinator).map((a) => a.id)).toEqual(["w"]);
    expect(folded.workersOf(orphan)).toEqual([]);
  });

  it("keeps workers that need a human at the top level", () => {
    const coordinator = agentCard({ id: "c" });
    const asking = agentCard({ id: "p", parentId: "c", permission });
    const blocked = agentCard({ id: "b", parentId: "c", state: "blocked" });
    const self = agentCard({ id: "s", parentId: "s" });
    expect(foldWorkers([coordinator, asking, blocked, self]).top.map((a) => a.id)).toEqual(["c", "p", "b", "s"]);
  });
});
