import { describe, expect, it } from "vitest";
import { agentCard } from "../../../../../test/fixtures";
import { displayStateOf, foldWorkers, groupAgents } from "./classify";

describe("displayStateOf", () => {
  it.each([
    [{ state: "working", dormant: false, interrupted: false }, "working"],
    [{ state: "blocked", dormant: true, interrupted: false }, "blocked"],
    [{ state: "waiting", dormant: true, interrupted: false }, "waiting"],
    [{ state: "idle", dormant: false, interrupted: true }, "paused"],
    [{ state: "idle", dormant: true, interrupted: true }, "dormant"],
    [{ state: "done", dormant: true, interrupted: false }, "dormant"],
    [{ state: "done", dormant: false, interrupted: false }, "done"],
  ] as const)("%o → %s", (fields, expected) => {
    expect(displayStateOf(agentCard(fields))).toBe(expected);
  });
});

describe("groupAgents", () => {
  it("splits by state and honors a hand-set rest mark", () => {
    const working = agentCard({ id: "w", state: "working" });
    const done = agentCard({ id: "d", state: "done" });
    const dismissed = agentCard({ id: "x", state: "done" });
    const idle = agentCard({ id: "i", state: "idle" });
    const groups = groupAgents([working, done, dismissed, idle], (agent) => (agent.id === "x" ? "idle" : null));
    expect(groups.working.map((a) => a.id)).toEqual(["w"]);
    expect(groups.needsMe.map((a) => a.id)).toEqual(["d"]);
    expect(groups.resting.map((a) => a.id).sort()).toEqual(["i", "x"]);
  });

  it("sends a session marked 잠자는 중 to dormant, even a blocked one", () => {
    const groups = groupAgents(
      [agentCard({ id: "done", state: "done" }), agentCard({ id: "blocked", state: "blocked" })],
      () => "dormant",
    );
    expect(groups.needsMe).toEqual([]);
    expect(groups.dormant.map((a) => a.id).sort()).toEqual(["blocked", "done"]);
  });

  it("orders needsMe by urgency then oldest state", () => {
    const agents = [
      agentCard({ id: "unread", state: "done", unread: true, stateSince: 1 }),
      agentCard({ id: "plain", state: "done", stateSince: 0 }),
      agentCard({ id: "blocked-new", state: "blocked", stateSince: 50 }),
      agentCard({ id: "blocked-old", state: "waiting", stateSince: 10 }),
    ];
    expect(groupAgents(agents, () => null).needsMe.map((a) => a.id)).toEqual([
      "blocked-old",
      "blocked-new",
      "unread",
      "plain",
    ]);
  });

  it("keeps paused and dormant sessions out of needsMe, but never a blocked one", () => {
    const groups = groupAgents(
      [
        agentCard({ id: "paused", state: "idle", interrupted: true }),
        agentCard({ id: "old-done", state: "done", dormant: true }),
        agentCard({ id: "old-paused", state: "idle", interrupted: true, dormant: true }),
        agentCard({ id: "old-blocked", state: "blocked", dormant: true }),
        agentCard({ id: "paused-dismissed", state: "idle", interrupted: true }),
      ],
      (agent) => (agent.id === "paused-dismissed" ? "idle" : null),
    );
    expect(groups.needsMe.map((a) => a.id)).toEqual(["old-blocked"]);
    expect(groups.paused.map((a) => a.id)).toEqual(["paused"]);
    expect(groups.dormant.map((a) => a.id).sort()).toEqual(["old-done", "old-paused"]);
    expect(groups.resting.map((a) => a.id)).toEqual(["paused-dismissed"]);
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
      () => null,
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
    const asking = agentCard({ id: "p", parentId: "c", state: "waiting" });
    const blocked = agentCard({ id: "b", parentId: "c", state: "blocked" });
    const self = agentCard({ id: "s", parentId: "s" });
    expect(foldWorkers([coordinator, asking, blocked, self]).top.map((a) => a.id)).toEqual(["c", "p", "b", "s"]);
  });
});
