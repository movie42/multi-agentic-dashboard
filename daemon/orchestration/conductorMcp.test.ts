import { describe, expect, it } from "vitest";
import type { RunnerPermissionAnswer, RunnerSession } from "../../src/common/runner/types.ts";
import { handleMcpMessage, type ConductorContext } from "./conductorMcp.ts";
import { OrchestrationStore } from "./OrchestrationStore.ts";

function session(id: string, cwd: string, overrides: Partial<RunnerSession> = {}): RunnerSession {
  return {
    id, cwd, kind: "claude", status: "idle", prompted: true, startedAt: 0, updatedAt: 0, exitCode: null,
    model: null, contextPercent: null, conversationId: null, permission: null, ...overrides,
  };
}

function setup() {
  let ids = 0;
  const store = new OrchestrationStore({ newId: () => `id${(ids += 1)}`, now: () => 0 });
  store.addConductor({ sessionId: "boss", scope: { kind: "worktree", root: "/w/a" }, grants: ["test"], extraGrants: [] });
  const sessions = new Map<string, RunnerSession>([
    ["boss", session("boss", "/w/a")],
    ["other", session("other", "/w/z")],
  ]);
  const delivered: [string, string][] = [];
  const answered: [string, string, RunnerPermissionAnswer][] = [];
  const context: ConductorContext = {
    store,
    sessions: {
      list: () => [...sessions.values()],
      get: (id) => sessions.get(id) ?? null,
      launch: (request) => {
        const created = session(`w${sessions.size}`, request.cwd);
        sessions.set(created.id, created);
        return created;
      },
      answerPermission: (id, requestId, answer) => {
        answered.push([id, requestId, answer]);
        return true;
      },
    },
    rules: { deliver: (id, text) => delivered.push([id, text]), readResult: async () => "latest" },
    worktreesOf: async () => [{ path: "/w/a", branch: "feat/a" }, { path: "/w/a-child", branch: "feat/a-child" }],
  };
  const call = (name: string, args: Record<string, unknown>) =>
    handleMcpMessage("boss", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, context);
  return { store, sessions, delivered, answered, call, context };
}

const textOf = (reply: unknown) => JSON.stringify(reply);

describe("conductor MCP", () => {
  it("answers initialize with the client's protocol version and lists the tools", async () => {
    const { context } = setup();
    const init = await handleMcpMessage("boss", { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26" } }, context);
    expect(textOf(init)).toContain("2025-03-26");
    const list = await handleMcpMessage("boss", { jsonrpc: "2.0", id: 1, method: "tools/list" }, context);
    expect(textOf(list)).toContain("start_session");
    expect(await handleMcpMessage("boss", { jsonrpc: "2.0", method: "notifications/initialized" }, context)).toBeNull();
  });

  it("starts a worker inside its scope and links it both ways", async () => {
    const { call, store } = setup();
    expect(textOf(await call("start_session", { worktree_path: "/w/a-child", prompt: "build it" }))).not.toContain("isError");
    const kinds = store.state().links.map((link) => `${link.from}>${link.to}:${link.kind}`);
    expect(kinds).toEqual(["boss>w2:delegate", "w2>boss:report"]);
  });

  it("refuses worktrees and sessions outside its scope", async () => {
    const { call, delivered } = setup();
    expect(textOf(await call("start_session", { worktree_path: "/w/z", prompt: "x" }))).toContain("isError");
    expect(textOf(await call("send_to_session", { session_id: "other", text: "x" }))).toContain("isError");
    expect(delivered).toEqual([]);
  });

  it("answers only permission requests delegated to it", async () => {
    const { call, sessions, answered } = setup();
    const permission = { id: "p1", receivedAt: 0, toolName: "Bash", toolInput: { command: "bun test" }, suggestions: [] };
    sessions.set("w9", session("w9", "/w/a", { permission: { ...permission, delegatedTo: "someone-else" } }));
    expect(textOf(await call("answer_permission", { session_id: "w9", request_id: "p1", decision: "allow" }))).toContain("isError");
    sessions.set("w9", session("w9", "/w/a", { permission: { ...permission, delegatedTo: "boss" } }));
    await call("answer_permission", { session_id: "w9", request_id: "p1", decision: "allow" });
    expect(answered).toEqual([["w9", "p1", { behavior: "allow", suggestionIndex: null }]]);
  });

  it("queues a worktree proposal instead of creating anything", async () => {
    const { call, store } = setup();
    await call("propose_worktree", { name: "COMP-1", branch: "feat/COMP-1", base_branch: "develop", prompt: "start" });
    expect(store.state().proposals).toMatchObject([{ conductorId: "boss", name: "COMP-1", branch: "feat/COMP-1" }]);
  });
});
