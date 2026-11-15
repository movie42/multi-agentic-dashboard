import { describe, expect, it } from "vitest";
import { permissionInputOf } from "./permissions.ts";

describe("permissionInputOf for questions", () => {
  it("leaves a question it cannot read to the terminal instead of showing a plain allow button", () => {
    expect(permissionInputOf({ tool_name: "AskUserQuestion", tool_input: { questions: [] } })).toBeNull();
    expect(permissionInputOf({ tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "어느 쪽?", options: [{}] }] } })).toBeNull();
    expect(permissionInputOf({ tool_name: "AskUserQuestion", tool_input: {} })).toBeNull();
  });
});
