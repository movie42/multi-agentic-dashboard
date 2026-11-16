import { describe, expect, it } from "vitest";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import { Orchestration, parseSavedOrchestration } from "./Orchestration.ts";

function session(id: string, overrides: Partial<RunnerSession> = {}): RunnerSession {
  return {
    id,
    cwd: `/repo/${id}`,
    kind: "claude",
    status: "idle",
    prompted: true,
    startedAt: 1,
    updatedAt: 1,
    exitCode: null,
    model: null,
    contextPercent: null,
    conversationId: null,
    permission: null,
    orchestration: null,
    ...overrides,
  };
}

const scope = { kind: "project" as const, root: "/repo", paths: ["/repo"] };

function setup(ids: string[] = ["c", "a", "b"]) {
  const sessions = new Map(ids.map((id) => [id, session(id)]));
  const sent: Array<{ id: string; text: string }> = [];
  const clock = { now: 1000 };
  let next = 0;
  const orchestration = new Orchestration({
    get: (id) => sessions.get(id) ?? null,
    send: (id, text) => sent.push({ id, text }),
    onChange: () => {},
    now: () => clock.now,
    newId: () => `l${(next += 1)}`,
  });
  const setStatus = (id: string, status: RunnerSession["status"]) => {
    const current = sessions.get(id);
    if (current) sessions.set(id, { ...current, status });
  };
  /** A delivered prompt shows up as UserPromptSubmit, the session works, then stops. */
  const runTurn = (id: string, answer: string) => {
    orchestration.onPrompt(id);
    setStatus(id, "idle");
    orchestration.onStop(id, answer);
  };
  return { orchestration, sessions, sent, clock, setStatus, runTurn };
}

describe("Orchestration records", () => {
  it("marks a conductor and shows the delegate line as the worker's parent", () => {
    const { orchestration, sessions } = setup();
    orchestration.addConductor("c", { scope, grants: ["edit"] });
    orchestration.connect("c", "a", "delegate");
    const [conductor, worker] = orchestration.decorate([sessions.get("c")!, sessions.get("a")!]);
    expect(conductor?.orchestration?.conductor?.grants).toEqual(["edit"]);
    expect(conductor?.orchestration?.links.map((link) => link.to)).toEqual(["a"]);
    expect(worker?.orchestration?.parentId).toBe("c");
  });

  it("saves under the conversation id a restart resumes with and reads it back", () => {
    const { orchestration, sessions } = setup();
    orchestration.addConductor("c", { scope, grants: ["build"] });
    orchestration.connect("a", "c", "report");
    sessions.set("a", session("a", { conversationId: "a2" }));
    const saved = JSON.parse(JSON.stringify(orchestration.snapshot([...sessions.values()])));
    const parsed = parseSavedOrchestration(saved);
    expect(Object.keys(parsed.conductors)).toEqual(["c"]);
    expect(parsed.links).toEqual([expect.objectContaining({ from: "a2", to: "c", kind: "report" })]);
  });

  it("drops conductors and lines whose sessions are gone", () => {
    const { orchestration } = setup();
    orchestration.addConductor("c", { scope, grants: [] });
    orchestration.connect("c", "a", "delegate");
    orchestration.prune(new Set(["c"]));
    expect(orchestration.links()).toEqual([]);
    expect(orchestration.isConductor("c")).toBe(true);
  });

  it("ignores broken entries in the saved file", () => {
    expect(parseSavedOrchestration({ conductors: { x: { scope: { kind: "nope" } } }, links: [{ id: 1 }] })).toEqual({ conductors: {}, links: [] });
  });

  it("checks scope by folder, not by string prefix", () => {
    const { orchestration } = setup();
    orchestration.addConductor("c", { scope: { kind: "worktree", root: "/repo/app", paths: ["/repo/app"] }, grants: [] });
    expect(orchestration.inScope("c", "/repo/app/src")).toBe(true);
    expect(orchestration.inScope("c", "/repo/app-other")).toBe(false);
  });
});

describe("Orchestration rules", () => {
  it("sends the work written on a delegate line to the worker right away", () => {
    const { orchestration, sent } = setup();
    orchestration.connect("c", "a", "delegate", "테스트 고쳐 줘");
    expect(sent).toEqual([{ id: "a", text: expect.stringContaining("테스트 고쳐 줘") }]);
    expect(sent[0]?.text).toContain("세션 c");
    expect(orchestration.links()).toEqual([
      expect.objectContaining({ kind: "delegate", from: "c", to: "a" }),
      expect.objectContaining({ kind: "report", from: "a", to: "c" }),
    ]);
    orchestration.connect("c", "b", "delegate");
    expect(sent).toHaveLength(1);
  });

  it("reports a worker's last answer to its target when the worker stops", () => {
    const { orchestration, sent } = setup();
    orchestration.connect("a", "c", "report");
    orchestration.onStop("a", "done: 3 files changed");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.id).toBe("c");
    expect(sent[0]?.text).toContain("done: 3 files changed");
  });

  it("starts the next session with the line's prompt", () => {
    const { orchestration, sent } = setup();
    orchestration.connect("a", "b", "next", "review the diff");
    orchestration.onStop("a", "implemented");
    expect(sent[0]).toEqual({ id: "b", text: expect.stringContaining("review the diff") });
  });

  it("queues for a busy target and hands it over at the target's next stop", () => {
    const { orchestration, sent, setStatus } = setup();
    orchestration.connect("a", "c", "report");
    setStatus("c", "working");
    orchestration.onStop("a", "first");
    expect(sent).toEqual([]);
    expect(orchestration.queued("c")).toBe(1);
    setStatus("c", "idle");
    orchestration.onStop("c", "conductor reply");
    expect(sent.map((item) => item.id)).toEqual(["c"]);
  });

  it("sends one queued message at a time until the first is submitted", () => {
    const { orchestration, sent } = setup();
    orchestration.deliver("c", "one", null);
    orchestration.deliver("c", "two", null);
    expect(sent.map((item) => item.text)).toEqual(["one"]);
    orchestration.onPrompt("c");
    orchestration.onStop("c", "ok");
    expect(sent.map((item) => item.text)).toEqual(["one", "two"]);
  });

  it("does not deliver into a session holding a permission request", () => {
    const { orchestration, sent, sessions } = setup();
    sessions.set("c", session("c", { permission: { id: "p", receivedAt: 1, toolName: "Bash", toolInput: {}, suggestions: [] } }));
    orchestration.deliver("c", "hello", null);
    expect(sent).toEqual([]);
  });

  it("pauses a line after it bounces back and forth three times", () => {
    const { orchestration, sent, runTurn } = setup();
    orchestration.connect("a", "b", "report");
    orchestration.connect("b", "a", "report");
    orchestration.onStop("a", "start");
    for (let turn = 0; turn < 10; turn += 1) {
      const last = sent.at(-1);
      if (!last) break;
      const before = sent.length;
      runTurn(last.id, `turn ${turn}`);
      if (sent.length === before) break;
    }
    const paused = orchestration.links().filter((link) => link.paused);
    expect(paused).toHaveLength(1);
    expect(paused[0]?.trips).toBe(3);
    expect(sent.length).toBeLessThan(10);
  });

  it("does not count conductor follow-ups as bounces", () => {
    const { orchestration, sent, runTurn } = setup();
    orchestration.connect("a", "c", "report");
    for (let turn = 0; turn < 5; turn += 1) {
      orchestration.deliver("a", `task ${turn}`, null);
      runTurn("a", `result ${turn}`);
      runTurn("c", "ack");
    }
    expect(orchestration.links().every((link) => !link.paused && link.trips === 0)).toBe(true);
    expect(sent.filter((item) => item.id === "c")).toHaveLength(5);
  });

  it("starts the bounce count over when a person types into a session, and after resume", () => {
    const { orchestration, runTurn, sent } = setup();
    const ab = orchestration.connect("a", "b", "report");
    orchestration.connect("b", "a", "report");
    orchestration.onStop("a", "start");
    runTurn("b", "x");
    runTurn("a", "y");
    expect(orchestration.links().some((link) => link.trips > 0)).toBe(true);
    orchestration.onPrompt("b"); // the daemon's own delivery to b
    orchestration.onPrompt("b"); // a person typing
    expect(orchestration.links().filter((link) => link.from === "b" || link.to === "b").every((link) => link.trips === 0)).toBe(true);
    expect(sent.length).toBeGreaterThan(0);
    expect(orchestration.resume(ab?.id ?? "")).toBe(true);
  });

  it("tells the conductor what happened to its worktree request and widens its scope", () => {
    const { orchestration, sent } = setup();
    orchestration.addConductor("c", { scope, grants: [] });
    const request = orchestration.requestWorktree("c", { branch: "feat/x", base: null, reason: "split work" });
    expect(orchestration.conductor("c")?.worktreeRequest?.branch).toBe("feat/x");
    expect(orchestration.settleWorktree("c", request?.id ?? "", "/elsewhere/feat-x")).toBe(true);
    expect(orchestration.conductor("c")?.scope.paths).toContain("/elsewhere/feat-x");
    expect(orchestration.conductor("c")?.worktreeRequest).toBeNull();
    expect(sent[0]?.text).toContain("/elsewhere/feat-x");
  });
});
