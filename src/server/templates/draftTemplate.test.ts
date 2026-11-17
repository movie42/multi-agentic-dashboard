import { describe, expect, it } from "vitest";
import { draftFromOutput, draftPrompt } from "./draftTemplate";

const result = (structured_output: unknown) => JSON.stringify([{ type: "system" }, { type: "result", is_error: false, structured_output }]);

describe("draftFromOutput", () => {
  it("turns the structured output into a template with fresh route ids and drops routes to unknown cards", () => {
    const template = draftFromOutput(
      result({
        name: "리뷰 흐름",
        cards: [
          { key: "build", title: "구현", prompt: "구현해", kind: "work", model: null, effort: null, continueFrom: false, pauseAfter: false, check: "bun run test" },
          { key: "review", title: "리뷰", prompt: "리뷰해", kind: "judge", model: "sonnet", effort: "low", continueFrom: false, pauseAfter: false, check: null },
        ],
        routes: [
          { from: "build", to: "review", label: null },
          { from: "review", to: "build", label: "고칠 것 있음" },
          { from: "review", to: "ghost", label: "통과" },
        ],
      }),
      "t-1",
    );
    expect(template.id).toBe("t-1");
    expect(template.name).toBe("리뷰 흐름");
    expect(template.cards.map((card) => `${card.key}:${card.kind}:${card.check}`)).toEqual(["build:work:bun run test", "review:judge:null"]);
    expect(template.routes).toEqual([
      { id: "r1", from: "build", to: "review", kind: "next", label: null, prompt: null },
      { id: "r2", from: "review", to: "build", kind: "next", label: "고칠 것 있음", prompt: null },
    ]);
  });

  it("throws the agent's error and refuses an output without cards", () => {
    expect(() => draftFromOutput(JSON.stringify({ type: "result", is_error: true, result: "rate limited" }), "t")).toThrow("rate limited");
    expect(() => draftFromOutput(result({ name: "x", cards: [], routes: [] }), "t")).toThrow("카드를 만들지 못했어요");
  });
});

describe("draftPrompt", () => {
  it("puts the description first and lists existing templates without ids", () => {
    const prompt = draftPrompt("  flow대로  ", [
      { id: "secret", name: "A", cards: [{ key: "a", title: "A", prompt: "", kind: "work", model: null, effort: null, continueFrom: false, pauseAfter: false, check: null }], routes: [], updatedAt: 1 },
    ]);
    expect(prompt.startsWith("설명: flow대로")).toBe(true);
    expect(prompt).toContain('"name":"A"');
    expect(prompt).not.toContain("secret");
  });
});
