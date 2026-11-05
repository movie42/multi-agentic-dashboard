import { describe, expect, it, vi } from "vitest";
import { isSendable, isSent } from "@/common/intentDiff/conclusion";
import type { AskConclusion, AskThread } from "@/common/intentDiff/types";
import { parseConclusionDraft } from "./AskRunner";
import { concludeAsk, type ConclusionDeps } from "./conclusions";

function thread(conclusion: AskConclusion | null = null): AskThread {
  return {
    id: "t1",
    worktreePath: "/w",
    anchor: { kind: "lines", file: "a.ts", startLine: 1, endLine: 2 },
    label: "a.ts",
    target: { kind: "fresh", reason: "chosen" },
    sessionId: "s1",
    cwd: "/w",
    turns: [],
    conclusion,
    createdAt: 1,
    updatedAt: 1,
  };
}

function depsWith(stored: AskThread, draft: AskConclusion | null = null) {
  let current = stored;
  const deps: ConclusionDeps = {
    get: async (id) => (id === current.id ? current : null),
    update: async (ids, change) => {
      if (ids.includes(current.id)) current = change(current);
      return [current];
    },
    draft: vi.fn(async () => draft ?? { text: "x", needsChange: true, draftedAt: 0, confirmedAt: null, sentAt: null }),
    now: () => 100,
  };
  return { deps, latest: () => current };
}

const drafted: AskConclusion = { text: "a.ts의 이름을 바꿔요", needsChange: true, draftedAt: 10, confirmedAt: null, sentAt: null };

describe("parseConclusionDraft", () => {
  it("reads the JSON even inside a code fence", () => {
    expect(parseConclusionDraft('```json\n{"needsChange": false, "conclusion": "그대로 둬요"}\n```')).toEqual({ needsChange: false, conclusion: "그대로 둬요" });
  });

  it("returns null for prose or an empty conclusion", () => {
    expect(parseConclusionDraft("바꿀 필요 없어요")).toBeNull();
    expect(parseConclusionDraft('{"needsChange": true, "conclusion": "  "}')).toBeNull();
  });
});

describe("concludeAsk", () => {
  it("stores the session's draft unconfirmed", async () => {
    const { deps, latest } = depsWith(thread(), drafted);
    await concludeAsk({ type: "draft", threadId: "t1" }, deps);
    expect(latest().conclusion).toEqual(drafted);
    expect(isSendable(latest().conclusion)).toBe(false);
  });

  it("makes a confirmed change sendable once, and again after it is reconfirmed", async () => {
    const { deps, latest } = depsWith(thread(drafted));
    await concludeAsk({ type: "confirm", threadId: "t1", text: "고친 결론" }, deps);
    expect(latest().conclusion).toMatchObject({ text: "고친 결론", confirmedAt: 100 });
    expect(isSendable(latest().conclusion)).toBe(true);

    await concludeAsk({ type: "sent", threadIds: ["t1"] }, { ...deps, now: () => 200 });
    expect(isSent(latest().conclusion)).toBe(true);
    expect(isSendable(latest().conclusion)).toBe(false);

    await concludeAsk({ type: "confirm", threadId: "t1", text: "다시" }, { ...deps, now: () => 400 });
    expect(isSendable(latest().conclusion)).toBe(true);
  });

  it("flipping the judgment keeps a confirmed conclusion confirmed but leaves no-change ones out", async () => {
    const { deps, latest } = depsWith(thread({ ...drafted, confirmedAt: 50 }));
    await concludeAsk({ type: "judge", threadId: "t1", needsChange: false }, deps);
    expect(latest().conclusion).toMatchObject({ needsChange: false, confirmedAt: 100 });
    expect(isSendable(latest().conclusion)).toBe(false);
  });

  it("fails for a thread that is gone", async () => {
    const { deps } = depsWith(thread());
    await expect(concludeAsk({ type: "draft", threadId: "nope" }, deps)).rejects.toThrow("대화를 찾지 못했어요");
  });
});
