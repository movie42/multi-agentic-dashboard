import { describe, expect, it } from "vitest";
import { turnsOf, TURN_LIMIT } from "./conversationTurns";

const user = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "user", uuid, timestamp: "2026-11-11T01:00:00Z", message: { content }, ...extra });
const assistant = (content: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "assistant", message: { content }, ...extra });

describe("turnsOf", () => {
  it("pairs each typed prompt with the last assistant text before the next prompt", () => {
    const turns = turnsOf([
      user("u1", "first question"),
      assistant([{ type: "text", text: "looking into it" }, { type: "tool_use", id: "t1", name: "Read", input: {} }]),
      user("r1", [{ type: "tool_result", tool_use_id: "t1", content: "file" }]),
      assistant([{ type: "text", text: "final answer" }]),
      user("u2", [{ type: "text", text: "second question" }]),
    ]);
    expect(turns).toEqual([
      { id: "u1", at: Date.parse("2026-11-11T01:00:00Z"), prompt: "first question", answer: "final answer" },
      { id: "u2", at: Date.parse("2026-11-11T01:00:00Z"), prompt: "second question", answer: null },
    ]);
  });

  it("skips reminders, interruptions, meta and sidechain lines", () => {
    const turns = turnsOf([
      user("u1", "real"),
      user("m1", "<system-reminder>noise</system-reminder>"),
      user("m2", "[Request interrupted by user]"),
      user("m3", "meta text", { isMeta: true }),
      user("c1", "/compact"),
      user("c2", "This session is being continued from a previous conversation that ran out of context."),
      user("c3", "summary", { isCompactSummary: true }),
      user("s1", "subagent prompt", { isSidechain: true }),
      assistant([{ type: "text", text: "subagent answer" }], { isSidechain: true }),
    ]);
    expect(turns.map((turn) => [turn.prompt, turn.answer])).toEqual([["real", null]]);
  });

  it("keeps only the most recent turns", () => {
    const lines = Array.from({ length: TURN_LIMIT + 5 }, (_, index) => user(`u${index}`, `q${index}`));
    const turns = turnsOf(lines);
    expect(turns).toHaveLength(TURN_LIMIT);
    expect(turns[0]?.prompt).toBe("q5");
  });
});
