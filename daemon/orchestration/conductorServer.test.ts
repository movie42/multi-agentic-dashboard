import { TemplateRuns } from "../templates/TemplateRuns.ts";
import { TemplateStore } from "../templates/TemplateStore.ts";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import { createRunnerServer, type RunnerServer } from "../server.ts";
import { SessionRegistry, type PtyProcess } from "../session/SessionRegistry.ts";
import { Orchestration } from "./Orchestration.ts";
import { Dictation } from "../session/Dictation.ts";

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
  const runner = createRunnerServer({ registry, orchestration, runs: new TemplateRuns({ get: (id) => registry.get(id), launch: (request) => registry.launch(request), deliver: () => true, lastAnswer: () => null, check: async () => true, onChange: () => {} }), templates: new TemplateStore({ file: "/nonexistent/templates.json", write: async () => {} }), dictation: new Dictation({ spawn: () => { throw new Error("no dictation in tests"); }, claude: "claude", cwd: "/", env: {} }), port: PORT, allowedOrigins: [], appConductorFolder: "/tmp/agent-control-test-conductor" });
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
  it("launches a conductor, opens a worker without permission prompts through MCP, and routes its reports back", async () => {
    const { runner, sent, commands, post, call, sessions } = setup();
    await listen(runner);

    const launched = await (await post("/sessions", { cwd: folder, prompt: "plan", conductor: { scope: { kind: "project", root: folder, paths: [], projects: [folder] } } })).json();
    const conductorId: string = launched.session.id;
    expect(commands[0]?.args).toEqual(["conductor"]);
    expect(launched.session.orchestration.conductor.scope.projects).toEqual([folder]);

    const init = await (await post(`/mcp/${conductorId}`, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(init.result.serverInfo.name).toBe("agent-control");
    expect(init.result.instructions).toContain("report");
    expect(init.result.instructions).not.toContain("permission");
    const listed = await (await post(`/mcp/${conductorId}`, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    const tools = listed.result.tools.map((tool: { name: string }) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["start_session", "render_ui"]));
    expect(tools).not.toContain("answer_permission");
    expect((await post(`/mcp/${conductorId}`, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

    expect((await call(conductorId, "start_session", { cwd: "/somewhere/else", prompt: "x" })).isError).toBe(true);
    const started = await call(conductorId, "start_session", { cwd: folder, prompt: "run the tests" });
    expect(started.isError).toBe(false);
    const worker = (await sessions()).find((session) => session.id !== conductorId);
    const workerId = worker?.id ?? "";
    expect(worker?.orchestration?.parentId).toBe(conductorId);
    expect(worker?.permissionMode).toBe("bypassPermissions");

    await post(`/hooks/${conductorId}/Stop`, {});
    const response = await post(`/hooks/${workerId}/PermissionRequest`, { tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "어느 브랜치로 할까요?", header: "브랜치", options: [{ label: "main" }, { label: "develop" }] }] } });
    expect(await response.json()).toEqual({});
    await until(() => sent.length > 0);
    expect(sent[0]).toEqual({ id: conductorId, text: expect.stringContaining(`세션 ${workerId}`) });
    expect(sent[0]?.text).toContain("사람의 답을 기다려요");

    await post(`/hooks/${conductorId}/UserPromptSubmit`, {});
    await post(`/hooks/${conductorId}/Stop`, {});
    await post(`/hooks/${workerId}/Stop`, { last_assistant_message: "all 12 tests pass" });
    await until(() => sent.length > 1);
    expect(sent[1]).toEqual({ id: conductorId, text: expect.stringContaining("all 12 tests pass") });
  });

  it("gives a session that is not a conductor only render_ui", async () => {
    const { runner, registry, post } = setup();
    await listen(runner);
    const plain = registry.launch({ cwd: folder });
    const listed = await (await post(`/mcp/${plain.id}`, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["render_ui"]);
    const refused = await (await post(`/mcp/${plain.id}`, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "start_session", arguments: {} } })).json();
    expect(refused.result.isError).toBe(true);
  });

  it("holds a worktree request until the dashboard settles it", async () => {
    const { runner, sent, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (await post("/sessions", { cwd: folder, conductor: { scope: { kind: "worktree", root: folder, paths: [] } } })).json();
    const id: string = launched.session.id;
    expect((await call(id, "request_worktree", { branch: "feat/split", reason: "parallel work" })).isError).toBe(false);
    const request = (await sessions())[0]?.orchestration?.conductor?.worktreeRequest;
    expect(request?.branch).toBe("feat/split");
    expect((await post(`/conductors/${id}/worktree`, { requestId: request?.id, path: "/tmp/feat-split" })).status).toBe(200);
    expect((await sessions())[0]?.orchestration?.conductor?.scope.paths).toContain("/tmp/feat-split");
    expect(sent.at(-1)?.text).toContain("/tmp/feat-split");
  });
  it("runs an app conductor in its own folder and asks the person before reaching another project", async () => {
    const { runner, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (
      await post("/sessions", { cwd: "/", conductor: { scope: { kind: "app", root: "/", paths: [], projects: [] }, knownProjects: [folder] } })
    ).json();
    const id: string = launched.session.id;
    expect(launched.session.cwd).toBe("/tmp/agent-control-test-conductor");
    expect(launched.session.orchestration.conductor.scope.root).toBe("/tmp/agent-control-test-conductor");
    expect((await call(id, "start_session", { cwd: folder, prompt: "x" })).isError).toBe(true);
    expect(JSON.parse((await call(id, "list_projects", {})).text).others).toEqual([folder]);
    expect((await call(id, "request_worktree", { branch: "feat/x", reason: "r" })).isError).toBe(true);

    expect((await call(id, "request_project", { project: folder, reason: "fix the build" })).isError).toBe(false);
    const request = (await sessions())[0]?.orchestration?.conductor?.projectRequest;
    expect(request?.path).toBe(folder);
    expect((await post(`/conductors/${id}/project`, { requestId: request?.id, path: folder })).status).toBe(200);
    expect((await call(id, "start_session", { cwd: folder, prompt: "x" })).isError).toBe(false);
    expect((await call(id, "request_worktree", { branch: "feat/x", reason: "r" })).isError).toBe(false);
    expect((await sessions()).find((session) => session.id === id)?.orchestration?.conductor?.worktreeRequest?.project).toBe(folder);
  });

  it("makes a worktree conductor's request in its own project even when it has another project", async () => {
    const { runner, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (await post("/sessions", { cwd: folder, conductor: { scope: { kind: "worktree", root: folder, paths: [], projects: ["/other"] } } })).json();
    const id: string = launched.session.id;
    expect((await call(id, "request_worktree", { branch: "feat/x", reason: "r" })).isError).toBe(false);
    expect((await sessions())[0]?.orchestration?.conductor?.worktreeRequest?.project).toBeNull();
  });

  it("lists its worktrees and opens the first worker in a requested worktree without permission prompts", async () => {
    const { runner, post, call, sessions } = setup();
    await listen(runner);
    const launched = await (await post("/sessions", { cwd: folder, conductor: { scope: { kind: "worktree", root: folder, paths: [] } } })).json();
    const id: string = launched.session.id;
    expect(JSON.parse((await call(id, "list_worktrees", {})).text)).toEqual([{ path: folder, sessions: 0 }]);

    await call(id, "request_worktree", { branch: "feat/split", reason: "parallel work", prompt: "write the parser" });
    const request = (await sessions())[0]?.orchestration?.conductor?.worktreeRequest;
    expect(request?.prompt).toBe("write the parser");
    await post(`/conductors/${id}/worktree`, { requestId: request?.id, path: folder });
    const worker = (await sessions()).find((session) => session.id !== id);
    expect(worker?.orchestration?.parentId).toBe(id);
    expect(worker?.orchestration?.links).toEqual([expect.objectContaining({ kind: "report", to: id })]);
    expect(worker?.permissionMode).toBe("bypassPermissions");
  });
});
