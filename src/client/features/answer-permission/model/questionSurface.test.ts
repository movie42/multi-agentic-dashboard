import { describe, expect, it } from "vitest";
import { validateUiMessages } from "@/common/a2ui/messages";
import type { RunnerQuestion } from "@/common/runner/questions";
import { answersFrom, questionSurface } from "./questionSurface";

const single: RunnerQuestion = {
  question: "어떻게 맞출까요?",
  header: "Pull 방식",
  multiSelect: false,
  options: [{ label: "원격으로 맞추기", description: "reset --hard" }, { label: "그대로 두기" }],
};
const multi: RunnerQuestion = {
  question: "무엇을 확인할까요?",
    multiSelect: true,
  options: [{ label: "타입" }, { label: "린트" }],
};

describe("questionSurface", () => {
  it("sends a single question's option at once", () => {
    const messages = questionSurface([single]);
    expect(validateUiMessages(messages).ok).toBe(true);
    const json = JSON.stringify(messages);
    expect(json).toContain('"name":"answer"');
    expect(json).not.toContain('"name":"submit"');
  });

  it("collects several questions behind one send button", () => {
    const messages = questionSurface([single, multi]);
    expect(validateUiMessages(messages).ok).toBe(true);
    expect(JSON.stringify(messages)).toContain('"name":"submit"');
  });
});

describe("answersFrom", () => {
  it("prefers typed text, joins picks, and keys by question text", () => {
    expect(answersFrom([single, multi], { picked: { q0: ["그대로 두기"], q1: ["타입", "린트"] }, typed: { q0: "", q1: "  " } })).toEqual({
      "어떻게 맞출까요?": "그대로 두기",
      "무엇을 확인할까요?": "타입, 린트",
    });
    expect(answersFrom([single], { picked: { q0: ["그대로 두기"] }, typed: { q0: " rebase " } })).toEqual({ "어떻게 맞출까요?": "rebase" });
  });
});
