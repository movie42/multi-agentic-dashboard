import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chatItemsOf, inputDetail, stepsOf } from "./activitySteps";

const lines = readFileSync(path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl"), "utf8").split("\n");

describe("stepsOf", () => {
  it("matches the current activity steps", () => {
    expect(stepsOf(lines)).toMatchSnapshot();
  });

  it("keeps only the last 40 steps", () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      JSON.stringify({ type: "user", uuid: `u${index}`, message: { content: `prompt ${index}` } }),
    );
    const steps = stepsOf(many);
    expect(steps).toHaveLength(40);
    expect(steps[0]).toMatchObject({ kind: "prompt", text: "prompt 5" });
  });
});

describe("chatItemsOf", () => {
  it("keeps answers whole and shows each tool's input", () => {
    const long = "가".repeat(900);
    const chat = chatItemsOf([
      JSON.stringify({ type: "user", uuid: "u1", message: { content: "질문" } }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        message: {
          content: [
            { type: "text", text: long },
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/repo/a.ts", limit: 20 } },
          ],
        },
      }),
    ]);
    expect(chat.map((item) => item.kind)).toEqual(["prompt", "text", "tool"]);
    expect(chat[1]).toMatchObject({ kind: "text", text: long });
    expect(chat[2]).toMatchObject({ kind: "tool", name: "Read", detail: JSON.stringify({ file_path: "/repo/a.ts", limit: 20 }, null, 2) });
  });

  it("shows a command as it is", () => {
    expect(inputDetail({ command: "git status", description: "x" })).toBe("git status");
    expect(inputDetail({})).toBeNull();
  });
});

describe("chatItemsOf local commands", () => {
  const line = (entry: Record<string, unknown>) => JSON.stringify({ uuid: "u", timestamp: "2026-11-16T00:00:00Z", ...entry });

  it("shows typed slash commands, their output and shell commands", () => {
    const steps = chatItemsOf([
      line({ type: "user", isMeta: true, message: { content: "<local-command-caveat>x</local-command-caveat>" } }),
      line({ uuid: "a", type: "user", message: { content: "<command-name>/context</command-name>\n<command-message>context</command-message>\n<command-args></command-args>" } }),
      line({ uuid: "b", type: "system", subtype: "local_command", content: "<local-command-stdout>\u001b[2mContext 12%\u001b[0m</local-command-stdout>" }),
      line({ uuid: "c", type: "system", subtype: "local_command", content: "<local-command-stdout></local-command-stdout>" }),
      line({ uuid: "d", type: "user", message: { content: "<bash-input>git status</bash-input>" } }),
      line({ uuid: "e", type: "user", message: { content: "<bash-stdout>clean</bash-stdout><bash-stderr>warn</bash-stderr>" } }),
    ]);
    const shown = steps.map((step) =>
      step.kind === "prompt" || step.kind === "text" || step.kind === "output"
        ? { kind: step.kind, text: step.text, error: step.kind === "output" ? step.error : undefined }
        : { kind: step.kind },
    );
    expect(shown).toEqual([
      { kind: "prompt", text: "/context", error: undefined },
      { kind: "output", text: "Context 12%", error: false },
      { kind: "prompt", text: "! git status", error: undefined },
      { kind: "output", text: "clean", error: false },
      { kind: "output", text: "warn", error: true },
    ]);
  });

  it("keeps the activity timeline free of them", () => {
    expect(stepsOf([line({ type: "user", message: { content: "<command-name>/context</command-name>" } })])).toEqual([]);
  });
});

describe("chatItemsOf questions and plans", () => {
  const question = {
    question: "어디에 둘까요?",
    header: "위치",
    multiSelect: false,
    options: [
      { label: "위 (Recommended)", description: "맨 위에 둬요" },
      { label: "아래", description: "맨 아래에 둬요" },
    ],
  };
  const ask = JSON.stringify({
    type: "assistant",
    uuid: "a1",
    message: { content: [{ type: "tool_use", id: "q1", name: "AskUserQuestion", input: { questions: [question] } }] },
  });

  it("shows the whole question with the answer the user picked", () => {
    const steps = chatItemsOf([
      ask,
      JSON.stringify({
        type: "user",
        uuid: "u1",
        toolUseResult: { questions: [question], answers: { "어디에 둘까요?": "아래" } },
        message: { content: [{ type: "tool_result", tool_use_id: "q1", content: 'Your questions have been answered: "어디에 둘까요?"="아래".' }] },
      }),
    ]);
    expect(steps).toEqual([
      { kind: "question", id: "q1", at: null, questions: [question], answers: { "어디에 둘까요?": "아래" }, status: "ok" },
    ]);
  });

  it("keeps an unanswered question waiting", () => {
    expect(chatItemsOf([ask])).toMatchObject([{ kind: "question", answers: null, status: "running" }]);
  });

  it("shows a plan in full with whether it was approved or rejected", () => {
    const plan = (id: string) =>
      JSON.stringify({
        type: "assistant",
        uuid: `a-${id}`,
        message: { content: [{ type: "tool_use", id, name: "ExitPlanMode", input: { plan: "# 계획\n\n1. 고친다" } }] },
      });
    const result = (id: string, error: boolean, content: string) =>
      JSON.stringify({
        type: "user",
        uuid: `u-${id}`,
        message: { content: [{ type: "tool_result", tool_use_id: id, is_error: error, content }] },
      });
    const steps = chatItemsOf([plan("p1"), result("p1", false, "User has approved your plan."), plan("p2"), result("p2", true, "범위를 줄여 주세요")]);
    expect(steps).toEqual([
      { kind: "plan", id: "p1", at: null, plan: "# 계획\n\n1. 고친다", status: "ok", feedback: null },
      { kind: "plan", id: "p2", at: null, plan: "# 계획\n\n1. 고친다", status: "error", feedback: "범위를 줄여 주세요" },
    ]);
  });

  it("leaves the activity timeline's one-line tool rows as they are", () => {
    expect(stepsOf([ask])).toMatchObject([{ kind: "tool", name: "AskUserQuestion" }]);
  });
});
