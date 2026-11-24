import { describe, expect, it } from "vitest";
import { CATALOG_ID } from "../../src/common/a2ui/catalog.ts";
import { handleUiMessage, RENDER_UI_TOOL, withUiTool } from "./uiMcp.ts";

const call = (args: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: RENDER_UI_TOOL, arguments: args } });
const surface = [
  { version: "1.0", createSurface: { surfaceId: "pick", catalogId: CATALOG_ID } },
  { version: "1.0", updateComponents: { surfaceId: "pick", components: [{ id: "root", component: "Text", text: "안녕" }] } },
];

describe("handleUiMessage", () => {
  it("lists only render_ui for an ordinary session", async () => {
    const reply = await handleUiMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(reply).toMatchObject({ result: { tools: [{ name: RENDER_UI_TOOL }] } });
  });

  it("accepts a valid surface and tells the agent how the answer comes back", async () => {
    const reply = await handleUiMessage(call({ messages: surface }));
    expect(reply).toMatchObject({ result: { content: [{ type: "text" }] } });
    expect(JSON.stringify(reply)).toContain("[A2UI action]");
    expect(JSON.stringify(reply)).not.toContain("isError");
  });

  it("returns the validation error so the agent can fix the surface", async () => {
    const reply = await handleUiMessage(call({ messages: [surface[0], { version: "1.0", updateComponents: { surfaceId: "pick", components: [{ id: "root", component: "Bogus" }] } }] }));
    expect(reply).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(reply)).toContain("Bogus");
  });

  it("answers initialize with instructions and ignores notifications", async () => {
    expect(await handleUiMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).toMatchObject({ result: { serverInfo: { name: "agent-control" } } });
    expect(await handleUiMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });
});

describe("withUiTool", () => {
  const inner = async (body: unknown) => {
    const method = (body as { method: string }).method;
    if (method === "tools/list") return { jsonrpc: "2.0", id: 1, result: { tools: [{ name: "list_sessions" }] } };
    return { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "inner" }] } };
  };

  it("adds render_ui to another server's tool list", async () => {
    const reply = await withUiTool({ jsonrpc: "2.0", id: 1, method: "tools/list" }, inner);
    expect(reply).toMatchObject({ result: { tools: [{ name: "list_sessions" }, { name: RENDER_UI_TOOL }] } });
  });

  it("handles render_ui itself and passes every other call through", async () => {
    expect(JSON.stringify(await withUiTool(call({ messages: surface }), inner))).toContain("[A2UI action]");
    const other = await withUiTool({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_sessions" } }, inner);
    expect(JSON.stringify(other)).toContain("inner");
  });
});
