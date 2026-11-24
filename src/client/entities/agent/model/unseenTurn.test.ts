import { describe, expect, it } from "vitest";
import { agentCard } from "../../../../../test/fixtures";
import { isUnseenTurn, turnKey, withSeen } from "./unseenTurn";

const SINCE = 1_000;

describe("isUnseenTurn", () => {
  it("is true for 내 차례 that arrived after first use and was never clicked", () => {
    expect(isUnseenTurn(agentCard({ id: "a", state: "done", stateSince: 2_000 }), () => null, new Set(), SINCE)).toBe(true);
  });

  it("is false once that turn was clicked", () => {
    const agent = agentCard({ id: "a", state: "done", stateSince: 2_000 });
    expect(isUnseenTurn(agent, () => null, new Set([turnKey(agent)]), SINCE)).toBe(false);
  });

  it("comes back when the session finishes another turn", () => {
    const earlier = agentCard({ id: "a", state: "done", stateSince: 2_000 });
    const later = agentCard({ id: "a", state: "done", stateSince: 3_000 });
    expect(isUnseenTurn(later, () => null, new Set([turnKey(earlier)]), SINCE)).toBe(true);
  });

  it("ignores turns that were already waiting before the feature was first used", () => {
    expect(isUnseenTurn(agentCard({ id: "a", state: "done", stateSince: 500 }), () => null, new Set(), SINCE)).toBe(false);
  });

  it.each([
    [{ state: "working" }],
    [{ state: "blocked" }],
    [{ state: "idle" }],
    [{ state: "done", dormant: true }],
    [{ state: "done", agentType: "shell" }],
  ] as const)("is false for %o", (fields) => {
    expect(isUnseenTurn(agentCard({ id: "a", stateSince: 2_000, ...fields }), () => null, new Set(), SINCE)).toBe(false);
  });

  it("is false when a person marked the turn 쉬는 중", () => {
    expect(isUnseenTurn(agentCard({ id: "a", state: "done", stateSince: 2_000 }), () => "idle", new Set(), SINCE)).toBe(false);
  });
});

describe("withSeen", () => {
  it("adds keys once and keeps the newest entries within the cap", () => {
    expect(withSeen(["a@1", "b@1"], ["b@1", "c@1"], 2)).toEqual(["b@1", "c@1"]);
  });
});
