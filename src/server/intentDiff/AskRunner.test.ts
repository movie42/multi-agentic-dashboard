import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AskEvent } from "@/common/intentDiff/types";
import { type AskChild, AskRunner, cwdFromHead, readStreamMessage, type SpawnAsk } from "./AskRunner";
import { AskStore } from "./AskStore";

function fakeChild(lines: unknown[], code = 0): AskChild {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(emitter, { stdout, stderr, stdin: null, kill: vi.fn(() => true) });
  setTimeout(() => {
    stdout.end(lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + "\n");
    stderr.end();
    stdout.on("end", () => setTimeout(() => emitter.emit("close", code), 0));
  }, 0);
  return child as unknown as AskChild;
}

async function setup(spawn: SpawnAsk) {
  const dir = await mkdtemp(path.join(tmpdir(), "ask-runner-"));
  const warn = vi.fn();
  const store = new AskStore(path.join(dir, "ask.json"), warn);
  const ids = ["thread-1", "session-1"];
  const runner = new AskRunner({
    store,
    spawn,
    warn,
    claudeBin: "claude",
    projectsDir: path.join(dir, "projects"),
    timeoutMs: 60_000,
    now: () => 100,
    newId: () => ids.shift() ?? "extra",
  });
  return { dir, store, runner, warn };
}

const input = {
  worktreePath: "/w",
  anchor: { kind: "lines" as const, file: "a.ts", startLine: 3, endLine: 3 },
  context: { label: "a.ts", planItem: null, intents: [], diff: "+x" },
  writerSessionId: null,
  chosenFresh: false,
  question: "왜?",
};

describe("readStreamMessage", () => {
  it("turns stream lines into events and the final result", () => {
    expect(readStreamMessage({ type: "stream_event", event: { delta: { type: "text_delta", text: "hi" } } }, "/w")).toEqual({
      kind: "event",
      event: { type: "text", text: "hi" },
    });
    expect(
      readStreamMessage({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/w/a.ts" } }] } }, "/w"),
    ).toEqual({ kind: "events", events: [{ type: "tool", label: "Read a.ts" }] });
    expect(readStreamMessage({ type: "result", is_error: true, result: "" }, "/w")).toEqual({
      kind: "result",
      outcome: { answer: null, error: "답을 받지 못했어요" },
    });
  });

  it("reads the cwd from a transcript head", () => {
    expect(cwdFromHead('{"type":"x"}\n{"cwd":"/a\\\\b"}')).toBe("/a\\b");
    expect(cwdFromHead("{}")).toBeNull();
  });
});

describe("AskRunner", () => {
  it("runs claude, streams events and saves the answer", async () => {
    const spawn = vi.fn<SpawnAsk>(() =>
      fakeChild([
        "not json",
        { type: "stream_event", event: { delta: { type: "text_delta", text: "답" } } },
        { type: "result", result: "답이에요" },
      ]),
    );
    const { runner, store, warn } = await setup(spawn);
    const prepared = await runner.prepareNewThread(input);
    expect(prepared.thread.target).toEqual({ kind: "fresh", reason: "no-writer" });
    expect(prepared.args).toContain("--session-id");
    const events: AskEvent[] = [];
    await runner.run(prepared, (event) => events.push(event));
    expect(events.map((event) => event.type)).toEqual(["thread", "text", "done"]);
    expect(spawn).toHaveBeenCalledWith("claude", prepared.args, expect.objectContaining({ cwd: "/w" }));
    expect((await store.get("thread-1"))?.turns[0]).toMatchObject({ answer: "답이에요", answeredAt: 100 });
    expect(warn).toHaveBeenCalledWith("ask", expect.anything(), { line: "not json" });
  });

  it("keeps a conclusion and a follow-up written while the answer was streaming", async () => {
    const { runner, store } = await setup(vi.fn<SpawnAsk>(() => fakeChild([{ type: "result", result: "첫 답" }])));
    const first = await runner.prepareNewThread(input);
    await runner.run(first, () => {});
    const thread = await store.get("thread-1");
    if (!thread) throw new Error("thread missing");
    const later = runner.prepareFollowUp(thread, "그럼?");
    const other = runner.prepareFollowUp(thread, "또?");
    const conclusion = { text: "고침", needsChange: true, draftedAt: 100, confirmedAt: 100, sentAt: null };
    await Promise.all([
      runner.run(later, () => {}),
      runner.run(other, () => {}),
      store.update(["thread-1"], (current) => ({ ...current, conclusion })),
    ]);
    const saved = await store.get("thread-1");
    expect(saved?.conclusion).toEqual(conclusion);
    expect(saved?.turns.map((turn) => [turn.question, turn.answer])).toEqual([
      ["왜?", "첫 답"],
      ["그럼?", "첫 답"],
      ["또?", "첫 답"],
    ]);
  });

  it("forks the writer session when its transcript is found", async () => {
    const { runner, dir } = await setup(vi.fn<SpawnAsk>());
    await mkdir(path.join(dir, "projects", "-w"), { recursive: true });
    await writeFile(path.join(dir, "projects", "-w", "writer.jsonl"), '{"cwd":"/w/sub"}\n');
    const prepared = await runner.prepareNewThread({ ...input, writerSessionId: "writer" });
    expect(prepared.thread).toMatchObject({ target: { kind: "writer", sessionId: "writer" }, cwd: "/w/sub" });
    expect(prepared.args).toEqual(expect.arrayContaining(["--resume", "writer", "--fork-session"]));
  });
});
