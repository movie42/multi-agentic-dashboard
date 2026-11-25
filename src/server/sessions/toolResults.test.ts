import { describe, expect, it } from "vitest";
import { chatItemsOf, stepsOf } from "./activitySteps";

describe("what a tool call printed", () => {
  const use = (id: string, name: string, input: Record<string, unknown>) =>
    JSON.stringify({ type: "assistant", uuid: `a-${id}`, message: { content: [{ type: "tool_use", id, name, input }] } });
  const result = (id: string, content: unknown) =>
    JSON.stringify({ type: "user", uuid: `r-${id}`, message: { content: [{ type: "tool_result", tool_use_id: id, content }] } });
  const lines = [
    use("t1", "Bash", { command: "echo hello", description: "Say hello" }),
    result("t1", "hello"),
    use("t2", "Skill", { skill: "flow", args: "버그" }),
    result("t2", "Launching skill: flow"),
    use("t3", "mcp__agent-control__list_sessions", { project: "compose", limit: 5 }),
    result("t3", [{ type: "text", text: "세션 2개" }, { type: "image", source: {} }]),
    use("t4", "Read", { file_path: "/repo/a.ts" }),
  ];

  it("keeps the output of a shell command, a skill and an MCP tool on its row in the chat", () => {
    expect(chatItemsOf(lines)).toMatchObject([
      { kind: "tool", name: "Bash", status: "ok", result: "hello" },
      { kind: "tool", name: "Skill", summary: "flow", status: "ok", result: "Launching skill: flow" },
      { kind: "tool", name: "mcp__agent-control__list_sessions", status: "ok", result: "세션 2개" },
      { kind: "tool", name: "Read", status: "running", result: null },
    ]);
  });

  it("cuts a long output short", () => {
    const chat = chatItemsOf([use("t1", "Bash", { command: "yes" }), result("t1", "y\n".repeat(5000))]);
    expect(chat[0]).toMatchObject({ kind: "tool" });
    expect(chat[0]?.kind === "tool" ? chat[0].result?.length : 0).toBeLessThanOrEqual(1500);
  });

  it("leaves the output out of the short activity list", () => {
    expect(stepsOf(lines)[0]).toMatchObject({ kind: "tool", name: "Bash", result: null });
  });

  it("names what an MCP tool was called with when its input has none of the usual fields", () => {
    expect(chatItemsOf(lines)[2]).toMatchObject({ summary: "compose" });
  });
});
