import { describe, expect, it } from "vitest";
import { agentCard } from "../../../../../test/fixtures";
import type { GraphEdge } from "./graph";
import { draftFromSelection } from "./templateDraft";

const next = (from: string, to: string, prompt: string | null): GraphEdge => ({ id: `${from}-${to}`, kind: "next", from, to, linkId: `${from}-${to}`, paused: false, prompt, files: [] });

describe("draftFromSelection", () => {
  it("orders cards along next lines and takes each card's prompt from the line feeding it", () => {
    const agents = [agentCard({ id: "b", title: "구현", prompt: "b first" }), agentCard({ id: "a", title: "계획", prompt: "/flow" }), agentCard({ id: "c", title: "검증", prompt: null })];
    const draft = draftFromSelection("t", agents, [next("a", "b", "구현해"), next("b", "c", null), next("c", "outside", "x")], (agent) => agent.title ?? "");
    expect(draft.cards.map((card) => `${card.key}:${card.title}:${card.prompt}`)).toEqual(["c1:계획:/flow", "c2:구현:구현해", "c3:검증:"]);
    expect(draft.routes.map((route) => `${route.from}>${route.to}`)).toEqual(["c1>c2", "c2>c3"]);
    expect(draft.name).toBe("계획 흐름");
  });
});
