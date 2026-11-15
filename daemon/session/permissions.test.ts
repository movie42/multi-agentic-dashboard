import { describe, expect, it } from "vitest";
import { answerOf, DENIED_MESSAGE, decisionFor, permissionInputOf } from "./permissions.ts";

const permission = {
  id: "p1",
  receivedAt: 0,
  toolName: "Bash",
  toolInput: { command: "rm -rf build" },
  suggestions: [{ type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "session" }],
};

const question = {
  question: "어떻게 맞출까요?",
  header: "Pull 방식",
  multiSelect: false,
  options: [{ label: "원격으로 맞추기", description: "reset --hard" }, { label: "그대로 두기" }],
};

describe("permissions", () => {
  it("reads the tool, its input and the suggestions Claude Code sends", () => {
    expect(
      permissionInputOf({ tool_name: "Bash", tool_input: { command: "ls" }, permission_suggestions: [{ type: "setMode" }, 3] }),
    ).toEqual({ toolName: "Bash", toolInput: { command: "ls" }, suggestions: [{ type: "setMode" }] });
  });

  it("holds questions so the dashboard can answer them", () => {
    expect(permissionInputOf({ tool_name: "AskUserQuestion", tool_input: { questions: [question] } })).toEqual({
      toolName: "AskUserQuestion",
      toolInput: { questions: [question] },
      suggestions: [],
    });
  });

  it("answers a question with updatedInput.answers, only for the questions asked", () => {
    const asked = { ...permission, toolName: "AskUserQuestion", toolInput: { questions: [question] }, suggestions: [] };
    expect(decisionFor(asked, { behavior: "answer", answers: { [question.question]: "원격으로 맞추기" } })).toEqual({
      behavior: "allow",
      updatedInput: { questions: [question], answers: { [question.question]: "원격으로 맞추기" } },
    });
    expect(decisionFor(asked, { behavior: "answer", answers: { "묻지 않은 질문": "예" } })).toBeNull();
    expect(decisionFor(asked, { behavior: "answer", answers: {} })).toBeNull();
    expect(decisionFor(permission, { behavior: "answer", answers: { [question.question]: "예" } })).toBeNull();
  });

  it("accepts a question answer only as a map of strings", () => {
    expect(answerOf({ requestId: "p1", answer: { behavior: "answer", answers: { "어떻게 할까요?": "예" } } })).toEqual({
      requestId: "p1",
      answer: { behavior: "answer", answers: { "어떻게 할까요?": "예" } },
    });
    expect(answerOf({ requestId: "p1", answer: { behavior: "answer", answers: { "어떻게 할까요?": 3 } } })).toBeNull();
    expect(answerOf({ requestId: "p1", answer: { behavior: "answer" } })).toBeNull();
  });

  it("turns an answer into the hook decision", () => {
    expect(decisionFor(permission, { behavior: "allow", suggestionIndex: null })).toEqual({ behavior: "allow" });
    expect(decisionFor(permission, { behavior: "allow", suggestionIndex: 0 })).toEqual({
      behavior: "allow",
      updatedPermissions: [permission.suggestions[0]],
    });
    expect(decisionFor(permission, { behavior: "allow", suggestionIndex: 4 })).toBeNull();
    expect(decisionFor(permission, { behavior: "deny", message: "no" })).toEqual({ behavior: "deny", message: "no" });
  });

  it("accepts only well-formed answers and fills in a deny message", () => {
    expect(answerOf({ requestId: "p1", answer: { behavior: "deny" } })).toEqual({
      requestId: "p1",
      answer: { behavior: "deny", message: DENIED_MESSAGE },
    });
    expect(answerOf({ requestId: "p1", answer: { behavior: "allow", suggestionIndex: -1 } })).toBeNull();
    expect(answerOf({ answer: { behavior: "allow", suggestionIndex: null } })).toBeNull();
  });
});
