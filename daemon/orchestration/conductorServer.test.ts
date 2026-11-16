import { TemplateRuns } from "../templates/TemplateRuns.ts";
import { TemplateStore } from "../templates/TemplateStore.ts";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import { createRunnerServer, type RunnerServer } from "../server.ts";
import { SessionRegistry, type PtyProcess } from "../session/SessionRegistry.ts";
import { Orchestration } from "./Orchestration.ts";

let PORT = 39_930;
let current: RunnerServer | null = null;
const folder = tmpdir();

function setup() {
  PORT += 1;
  const base = `http://127.0.0.1:${PORT}`;
  const pty: PtyProcess = { onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} };
  const commands: Array<{ args: string[] }> = [];
  let next = 0;
  const registry = new SessionRegistry({
    spawn: () => pty,
    commandFor: (request) => {
      commands.push({ args: request.conductor ? ["conductor"] : [] });
      return { file: "claude", args: [] };
    },
    env: {},
    newId: () => `id${(next += 1)}`,
  });
  const sent: Array<{ id: string; text: string }> = [];
  const orchestration = new Orchestration({ get: (id) => registry.get(id), send: (id, text) => sent.push({ id, text }), onChange: () => {} });
  const runner = createRunnerServer({ registry, orchestration, runs: new TemplateRuns({ get: (id) => registry.get(id), launch: (request) => registry.launch(request), deliver: () => true, lastAnswer: () => null, check: async () => true, onChange: () => {} }), templates: new TemplateStore({ file: "/nonexistent/templates.json", write: async () => {} }), port: PORT, allowedOrigins: [] });
  current = runner;
  const post = async (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let rpcId = 0;
  const call = async (conductor: string, name: string, args: Record<string, unknown>) => {
    const response = await post(`/mcp/${conductor}`, { jsonrpc: "2.0", id: (rpcId += 1), method: "tools/call", params: { name, arguments: args } });
    const body = await response.json();
    return { isError: body.result?.isError === true, text: String(body.result?.content?.[0]?.text ?? "") };
  };
  const sessions = async (): Promise<RunnerSession[]> => (await (await fetch(`${base}/sessions`)).json()).sessions;
  return { runner, registry, orchestration, sent, commands, post, call, sessions };
}

async function listen(runner: RunnerServer): Promise<void> {
  await new Promise<void>((resolve) => runner.server.listen(PORT, "127.0.0.1", resolve));
}

afterEach(async () => {
  current?.server.closeAllConnections();
  await new Promise((resolve) => current?.server.close(resolve) ?? resolve(null));
  current = null;
});

const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 50 && !check(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
};

describe("conductor over the runner server", () => {
  it("launches a conductor, opens a worker through MCP, and routes reports and delegated permissions", async () => {
    const { runner, sent, commands, post, call, sessions } = setup();
    await listen(runner);

    const launched = await (
      await post("/sessions", { cwd: folder, prompt: "plan", conductor: { scope: { kind: "project", root: folder, paths: [] }, grants: ["build"] } })
    ).json();
    const conductorId: string = launched.session.id;
    expect(commands[0]?.args).toEqual(["conductor"]);
    expect(launched.session.orchestration.conductor.scope.paths).toEqual([folder]);

    const init = await (await post(`/mcp/${conductorId}`, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(init.result.serverInfo.name).toBe("agent-control");
    const listed = await (await post(`/mcp/${conductorId}`, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toContain("start_session");
    expect((await post(`/mcp/${conductorId}`, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

    expect((await call(conductorId, "start_session", { cwd: "/somewhere/else", prompt: "x" })).isError).toBe(true);
    const started = await call(conductorId, "start_session", { cwd: folder, prompt: "run the tests" });
    expect(started.isError).toBe(false);
    const workerId = (await sessions()).find((session) => session.id !== conductorId)?.id ?? "";
    expect((await sessions()).find((session) => session.id === workerId)?.orchestration?.parentId).toBe(conductorId);

    await post(`/hooks/${conductorId}/Stop`, {});
    const permission = post(`/hooks/${workerId}/PermissionRequest`, { tool_name: "Bash", tool_input: { command: "bun run test" } });
    await until(() => sent.length > 0);
    expect(sent[0]?.id).toBe(conductorId);
    const requestId = /request_id: "([^"]+)"/.exec(sent[0]?.text ?? "")?.[1] ?? "";
    expect((await call(conductorId, "answer_permission", { session_id: workerId, request_id: requestId, decision: "allow" })).text).toBe("Allowed.");
    expect(await (await permission).json()).toMatchObject({ hookSpecificOutput: { decision: { behavior: "allow" } } });

    await post(`/hooks/${conductorId}/UserPromptSubmit`, {});
    await post(`/hooks/${conductorId}/Stop`, {});
    await post(`/hooks/${workerId}/Stop`, { last_assistant_message: "all 12 tests pass" });
    await until(() => sent.length > 1);
    expect(sent[1]).toEqual({ id: conductorId, text: expect.stringContaining("all 12 tests pass") });
  });

  it("lets a person through when the request is outside the delegated bundles", async () => {
    const { runner, sent, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (await post("/sessions", { cwd: folder, conductor: { scope: { kind: "project", root: folder, paths: [] }, grants: [] } })).json();
    await call(launched.session.id, "start_session", { cwd: folder, prompt: "x" });
    const workerId = (await sessions()).find((session) => session.id !== launched.session.id)?.id ?? "";
    const response = await post(`/hooks/${workerId}/PermissionRequest`, { tool_name: "Bash", tool_input: { command: "git push" } });
    expect(await response.json()).toEqual({});
    expect(sent).toEqual([]);
  });

  it("refuses MCP calls for a session that is not a conductor", async () => {
    const { runner, registry, post } = setup();
    await listen(runner);
    const plain = registry.launch({ cwd: folder });
    expect((await post(`/mcp/${plain.id}`, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status).toBe(404);
  });

  it("holds a worktree request until the dashboard settles it", async () => {
    const { runner, sent, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (await post("/sessions", { cwd: folder, conductor: { scope: { kind: "worktree", root: folder, paths: [] }, grants: [] } })).json();
    const id: string = launched.session.id;
    expect((await call(id, "request_worktree", { branch: "feat/split", reason: "parallel work" })).isError).toBe(false);
    const request = (await sessions())[0]?.orchestration?.conductor?.worktreeRequest;
    expect(request?.branch).toBe("feat/split");
    expect((await post(`/conductors/${id}/worktree`, { requestId: request?.id, path: "/tmp/feat-split" })).status).toBe(200);
    expect((await sessions())[0]?.orchestration?.conductor?.scope.paths).toContain("/tmp/feat-split");
    expect(sent.at(-1)?.text).toContain("/tmp/feat-split");
  });
  it("lists its worktrees, opens the first worker in a requested worktree, and can deny a delegated request", async () => {
    const { runner, registry, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (await post("/sessions", { cwd: folder, conductor: { scope: { kind: "worktree", root: folder, paths: [] }, grants: ["build"] } })).json();
    const id: string = launched.session.id;
    expect(JSON.parse((await call(id, "list_worktrees", {})).text)).toEqual([{ path: folder, sessions: 0 }]);

    await call(id, "request_worktree", { branch: "feat/split", reason: "parallel work", prompt: "write the parser" });
    const request = (await sessions())[0]?.orchestration?.conductor?.worktreeRequest;
    expect(request?.prompt).toBe("write the parser");
    await post(`/conductors/${id}/worktree`, { requestId: request?.id, path: folder });
    const worker = (await sessions()).find((session) => session.id !== id);
    expect(worker?.orchestration?.parentId).toBe(id);
    expect(worker?.orchestration?.links).toEqual([expect.objectContaining({ kind: "report", to: id })]);

    const workerId = worker?.id ?? "";
    const permission = post(`/hooks/${workerId}/PermissionRequest`, { tool_name: "Bash", tool_input: { command: "bun run build" } });
    await until(() => registry.get(workerId)?.permission !== null);
    const held = (await sessions()).find((session) => session.id === workerId)?.permission;
    expect(held?.delegatedTo).toBe(id);
    const requestId = held?.id ?? "";
    expect((await call(id, "answer_permission", { session_id: workerId, request_id: requestId, decision: "deny" })).text).toBe("Denied.");
    expect(await (await permission).json()).toMatchObject({ hookSpecificOutput: { decision: { behavior: "deny" } } });
  });
});
