import { describe, expect, it } from "vitest";
import { answerOf, DENIED_MESSAGE, decisionFor, permissionInputOf } from "./permissions.ts";

const permission = {
  id: "p1",
  receivedAt: 0,
  toolName: "Bash",
  toolInput: { command: "rm -rf build" },
  suggestions: [{ type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "session" }],
};

describe("permissions", () => {
  it("reads the tool, its input and the suggestions Claude Code sends", () => {
    expect(
      permissionInputOf({ tool_name: "Bash", tool_input: { command: "ls" }, permission_suggestions: [{ type: "setMode" }, 3] }),
    ).toEqual({ toolName: "Bash", toolInput: { command: "ls" }, suggestions: [{ type: "setMode" }] });
  });

  it("leaves questions to the terminal", () => {
    expect(permissionInputOf({ tool_name: "AskUserQuestion", tool_input: { questions: [] } })).toBeNull();
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
