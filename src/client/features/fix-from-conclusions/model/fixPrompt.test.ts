import { describe, expect, it } from "vitest";
import type { AskConclusion, AskThread } from "@/common/intentDiff/types";
import { fixPrompt, sendableThreads } from "./fixPrompt";

function thread(id: string, conclusion: AskConclusion | null, startLine = 3, endLine = 5): AskThread {
  return {
    id,
    worktreePath: "/w",
    anchor: { kind: "lines", file: `src/${id}.ts`, startLine, endLine },
    label: `${id}.ts`,
    target: { kind: "fresh", reason: "chosen" },
    sessionId: `s-${id}`,
    cwd: "/w",
    turns: [],
    conclusion,
    createdAt: 1,
    updatedAt: 1,
  };
}

const base: AskConclusion = { text: "이름을 바꿔요", needsChange: true, draftedAt: 1, confirmedAt: 2, sentAt: null };

describe("sendableThreads", () => {
  it("keeps confirmed changes not yet sent, and changes reconfirmed after sending", () => {
    const threads = [
      thread("a", base),
      thread("b", { ...base, confirmedAt: null }),
      thread("c", { ...base, needsChange: false }),
      thread("d", { ...base, sentAt: 3 }),
      thread("e", { ...base, confirmedAt: 5, sentAt: 3 }),
      thread("f", null),
    ];
    expect(sendableThreads(threads).map((item) => item.id)).toEqual(["a", "e"]);
  });
});

describe("fixPrompt", () => {
  it("numbers each conclusion with its place, indenting multi-line text", () => {
    const prompt = fixPrompt(sendableThreads([thread("a", base, 7, 7), thread("b", { ...base, text: "첫 줄\n둘째 줄" })]));
    expect(prompt).toContain("결론 2개를 반영해");
    expect(prompt).toContain("1. `src/a.ts:7` (a.ts)\n   이름을 바꿔요");
    expect(prompt).toContain("2. `src/b.ts:3-5` (b.ts)\n   첫 줄\n   둘째 줄");
  });
});
