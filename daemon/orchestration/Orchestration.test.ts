import { afterEach, describe, expect, it } from "vitest";
import { createRunnerServer, type RunnerServer } from "../server.ts";
import { SessionRegistry, type PtyProcess } from "../session/SessionRegistry.ts";
import { descendantsOf, Orchestration } from "./Orchestration.ts";

let PORT = 39_970;
let BASE = "";
let current: RunnerServer | null = null;

function setup() {
  PORT += 1;
  BASE = `http://127.0.0.1:${PORT}`;
  const written = new Map<string, string[]>();
  let next = 0;
  const commands: string[][] = [];
  const registry = new SessionRegistry({
    spawn: () => {
      const id = `s${next}`;
      const pty: PtyProcess = {
        onData: () => {},
        onExit: () => {},
        write: (data) => written.set(id, [...(written.get(id) ?? []), data]),
        resize: () => {},
        kill: () => {},
      };
      return pty;
    },
    commandFor: (request) => {
      commands.push(request.conductor ? ["conductor"] : []);
      return { file: "claude", args: [] };
    },
    env: {},
    newId: () => `s${(next += 1)}`,
  });
  const orchestration = new Orchestration({ registry, worktreeMetaFile: "/nonexistent/worktrees.json", onChange: () => {} });
  const runner = createRunnerServer({ registry, port: PORT, allowedOrigins: [], orchestration });
  return { runner, registry, orchestration, written, commands };
}

async function listen(runner: RunnerServer): Promise<void> {
  current = runner;
  await new Promise<void>((resolve) => runner.server.listen(PORT, "127.0.0.1", resolve));
}

afterEach(async () => {
  current?.server.closeAllConnections();
  await new Promise((resolve) => current?.server.close(resolve) ?? resolve(null));
  current = null;
});

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.json());

describe("orchestration over HTTP", () => {
  it("launches a conductor with its tools and records its scope", async () => {
    const { runner, commands, orchestration } = setup();
    await listen(runner);
    const body = await post("/orchestration/conductors", { cwd: "/repo", scope: { kind: "project", root: "/repo" }, grants: ["test", "bogus"], prompt: "plan" });
    expect(body.ok).toBe(true);
    expect(commands).toEqual([["conductor"]]);
    expect(orchestration.store.conductor(body.session.id)).toMatchObject({ scope: { kind: "project", root: "/repo" }, grants: ["test"] });
  });

  it("links two sessions and reports one's last answer to the other on Stop", async () => {
    const { runner, registry, written } = setup();
    registry.launch({ cwd: "/a" });
    registry.launch({ cwd: "/b" });
    await listen(runner);
    expect((await post("/orchestration/links", { from: "s1", to: "s2", kind: "report" })).ok).toBe(true);
    await post("/hooks/s1/Stop", { last_assistant_message: "all green" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((written.get("s2") ?? []).join("")).toContain("all green");
  });

  it("serves the conductor's MCP tools and answers notifications with 202", async () => {
    const { runner } = setup();
    await listen(runner);
    await post("/orchestration/conductors", { cwd: "/repo", scope: { kind: "project", root: "/repo" }, grants: [], prompt: "" });
    const list = await post("/mcp/s1", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain("start_session");
    const note = await fetch(`${BASE}/mcp/s1`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(note.status).toBe(202);
  });

  it("hands a delegated permission to the conductor and holds it even with no dashboard watching", async () => {
    const { runner, registry, orchestration, written } = setup();
    const boss = orchestration.launchConductor({ cwd: "/repo", scope: { kind: "project", root: "/repo" }, grants: ["test"], prompt: "" });
    const worker = registry.launch({ cwd: "/repo" });
    orchestration.store.addLink({ from: boss.id, to: worker.id, kind: "delegate" }, "conductor");
    await listen(runner);
    const pending = fetch(`${BASE}/hooks/${worker.id}/PermissionRequest`, { method: "POST", body: JSON.stringify({ tool_name: "Bash", tool_input: { command: "bun run test" } }) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const permission = registry.get(worker.id)?.permission;
    expect(permission?.delegatedTo).toBe(boss.id);
    expect((written.get(boss.id) ?? []).join("")).toContain("권한 요청");
    registry.answerPermission(worker.id, permission?.id ?? "", { behavior: "allow", suggestionIndex: null });
    expect((await (await pending).json()).hookSpecificOutput.decision.behavior).toBe("allow");
  });
});

describe("proposals", () => {
  it("keeps a proposal when the accept request carries no worktree path", async () => {
    const { runner, orchestration } = setup();
    const boss = orchestration.launchConductor({ cwd: "/repo", scope: { kind: "project", root: "/repo" }, grants: [], prompt: "" });
    const proposal = orchestration.store.addProposal({ conductorId: boss.id, name: "x", branch: "feat/x", baseBranch: "main", prompt: "" });
    await listen(runner);
    expect((await post(`/orchestration/proposals/${proposal.id}/accept`, {})).ok).toBe(false);
    expect(orchestration.store.state().proposals).toHaveLength(1);
    expect((await post(`/orchestration/proposals/${proposal.id}/accept`, { cwd: "/repo-x" })).ok).toBe(true);
    expect(orchestration.store.state().proposals).toHaveLength(0);
  });
});

describe("descendantsOf", () => {
  it("keeps the root and the worktrees branched from it, through any depth", () => {
    const all = ["/a", "/b", "/c", "/d"].map((path) => ({ path, branch: null }));
    const parents = new Map([["/b", "/a"], ["/c", "/b"], ["/d", "/x"]]);
    expect(descendantsOf("/a", all, parents).map((worktree) => worktree.path)).toEqual(["/a", "/b", "/c"]);
  });
});
