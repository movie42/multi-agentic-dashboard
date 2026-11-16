import { describe, expect, it } from "vitest";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import { lastAnswerOf } from "./lastAnswer.ts";
import { OrchestrationStore } from "./OrchestrationStore.ts";
import { RuleRunner } from "./RuleRunner.ts";

function session(id: string, status: RunnerSession["status"]): RunnerSession {
  return {
    id, cwd: `/w/${id}`, kind: "claude", status, prompted: true, startedAt: 0, updatedAt: 0, exitCode: null,
    model: null, contextPercent: null, conversationId: null, permission: null,
  };
}

function setup(statuses: Record<string, RunnerSession["status"]>) {
  const sessions = new Map(Object.entries(statuses).map(([id, status]) => [id, session(id, status)]));
  const written: [string, string][] = [];
  let ids = 0;
  const store = new OrchestrationStore({ newId: () => `l${(ids += 1)}`, now: () => 0 });
  const runner = new RuleRunner({
    store,
    sessions: { get: (id) => sessions.get(id) ?? null, write: (id, data) => written.push([id, data]) },
    readAnswer: async () => "from transcript",
    wait: async () => {},
    now: () => 0,
  });
  const setStatus = (id: string, status: RunnerSession["status"]) => sessions.set(id, session(id, status));
  return { store, runner, written, setStatus, sessions };
}

const typed = (written: [string, string][], id: string) => written.filter(([target, data]) => target === id && data !== "\r").map(([, data]) => data);

describe("RuleRunner", () => {
  it("types a worker's last answer into the session it reports to", async () => {
    const { store, runner, written } = setup({ worker: "idle", boss: "idle" });
    store.addLink({ from: "worker", to: "boss", kind: "report" }, "user");
    await runner.noteHook("worker", "Stop", { last_assistant_message: "done: 3 files" });
    expect(typed(written, "boss").join("")).toContain("done: 3 files");
  });

  it("falls back to the transcript when the hook carries no last message", async () => {
    const { store, runner, written } = setup({ worker: "idle", boss: "idle" });
    store.addLink({ from: "worker", to: "boss", kind: "report" }, "user");
    await runner.noteHook("worker", "SessionStart", { transcript_path: "/t.jsonl" });
    await runner.noteHook("worker", "Stop", {});
    expect(typed(written, "boss").join("")).toContain("from transcript");
  });

  it("holds text for a busy session until it is idle again", async () => {
    const { store, runner, written, setStatus, sessions } = setup({ worker: "idle", boss: "working" });
    store.addLink({ from: "worker", to: "boss", kind: "report" }, "user");
    await runner.noteHook("worker", "Stop", { last_assistant_message: "result" });
    expect(typed(written, "boss")).toEqual([]);
    expect(runner.pending("boss")).toBe(1);
    setStatus("boss", "idle");
    runner.sessionsChanged([...sessions.values()]);
    expect(typed(written, "boss").join("")).toContain("result");
  });

  it("delivers one queued message at a time", async () => {
    const { runner, written } = setup({ boss: "idle" });
    runner.deliver("boss", "first");
    runner.deliver("boss", "second");
    expect(typed(written, "boss")).toEqual(["first"]);
    await runner.noteHook("boss", "Stop", {});
    expect(typed(written, "boss")).toEqual(["first", "second"]);
  });

  it("pauses a back-and-forth after three trips each way", async () => {
    const { store, runner, written } = setup({ a: "idle", b: "idle" });
    store.addLink({ from: "a", to: "b", kind: "report" }, "user");
    store.addLink({ from: "b", to: "a", kind: "report" }, "user");
    for (let round = 0; round < 5; round += 1) {
      await runner.noteHook("a", "Stop", { last_assistant_message: `r${round}` });
      await runner.noteHook("b", "UserPromptSubmit", {});
    }
    expect(typed(written, "b")).toHaveLength(3);
    expect(store.state().links.find((link) => link.from === "a")?.paused).toBe(true);
  });

  it("tells a chained session to continue", async () => {
    const { store, runner, written } = setup({ a: "idle", b: "idle" });
    store.addLink({ from: "a", to: "b", kind: "next" }, "user");
    await runner.noteHook("a", "Stop", { last_assistant_message: "built" });
    expect(typed(written, "b").join("")).toContain("이어서 진행해 주세요");
  });
});

describe("lastAnswerOf", () => {
  it("returns the last assistant text block, skipping tool-only turns", () => {
    const jsonl = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "first" }] } }),
      JSON.stringify({ type: "user", message: { content: "next" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "final answer" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }),
    ].join("\n");
    expect(lastAnswerOf(jsonl)).toBe("final answer");
  });
});
