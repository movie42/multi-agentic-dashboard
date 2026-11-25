import { describe, expect, it } from "vitest";
import type { ActivityStep, ToolStatus } from "@/common/sessions/types";
import { withoutLiveQuestion } from "./chatSteps";

const question = (id: string, status: ToolStatus): ActivityStep => ({
  kind: "question",
  id,
  at: null,
  questions: [{ question: "PR 초안을 확인해주세요. 이대로 생성할까요?", options: [{ label: "생성" }] }],
  answers: status === "ok" ? { "PR 초안을 확인해주세요. 이대로 생성할까요?": "생성" } : null,
  status,
});

const text = (id: string): ActivityStep => ({ kind: "text", id, at: null, text: "PR 초안을 작성했습니다." });

describe("withoutLiveQuestion", () => {
  it("drops the waiting question while its live card is on screen", () => {
    const steps = [question("1", "ok"), text("2"), question("3", "running")];
    expect(withoutLiveQuestion(steps, true).map((step) => step.id)).toEqual(["1", "2"]);
  });

  it("keeps the waiting question when no live card answers it", () => {
    const steps = [text("1"), question("2", "running")];
    expect(withoutLiveQuestion(steps, false).map((step) => step.id)).toEqual(["1", "2"]);
  });
});
