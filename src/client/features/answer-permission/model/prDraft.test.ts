import { describe, expect, it } from "vitest";
import type { ActivityStep } from "@/common/sessions/types";
import { asksAboutPr, latestPrDraft } from "./prDraft";

const write = (id: string, path: string, content: string): ActivityStep => ({
  kind: "tool",
  id,
  at: null,
  name: "Write",
  summary: path,
  detail: null,
  document: { path, content },
  status: "ok",
});

describe("prDraft", () => {
  it("spots a PR question", () => {
    expect(asksAboutPr([{ header: "PR 생성", question: "이대로 생성할까요?", options: [] }])).toBe(true);
    expect(asksAboutPr([{ question: "어떤 색이 좋아요?", options: [] }])).toBe(false);
  });

  it("picks the latest PR body, not other markdown", () => {
    const steps = [write("1", "/r/.pr-body.tmp.md", "old"), write("2", "/r/.pr-body.tmp.md", "new"), write("3", "/r/docs/plan.md", "plan")];
    expect(latestPrDraft(steps)?.content).toBe("new");
    expect(latestPrDraft([write("1", "/r/docs/improve.md", "x")])).toBeNull();
  });
});
