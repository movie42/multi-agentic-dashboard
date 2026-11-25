import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countTranscriptTokens, sessionTokens } from "./transcriptTokens";

const assistant = (id: string, usage: Record<string, number>) =>
  JSON.stringify({ type: "assistant", requestId: `req_${id}`, message: { id, role: "assistant", usage } });

describe("countTranscriptTokens", () => {
  it("adds every kind of token once per message, though a message is written once per content block", () => {
    const usage = { input_tokens: 2, output_tokens: 200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 40000 };
    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      assistant("msg_1", usage),
      assistant("msg_1", usage),
      assistant("msg_2", { input_tokens: 1, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 500 }),
      "not json",
    ];
    expect(countTranscriptTokens(lines)).toEqual({ input: 3, output: 210, cacheWrite: 3000, cacheRead: 40500 });
  });
});

it("counts every assistant line that carries no message id, instead of folding them into one", () => {
  const line = JSON.stringify({ type: "assistant", message: { usage: { output_tokens: 10 } } });
  expect(countTranscriptTokens([line, line, line]).output).toBe(30);
});

describe("sessionTokens", () => {
  it("counts each Claude session id from its transcript and its subagents' transcripts, zero when there is no file", async () => {
    const projects = await mkdtemp(path.join(tmpdir(), "tokens-"));
    const cwd = "/Users/me/app";
    const dir = path.join(projects, "-Users-me-app");
    await mkdir(path.join(dir, "s1", "subagents"), { recursive: true });
    await writeFile(path.join(dir, "s1.jsonl"), `${assistant("m1", { input_tokens: 1, output_tokens: 2 })}\n`);
    await writeFile(path.join(dir, "s1", "subagents", "agent-a.jsonl"), `${assistant("m2", { output_tokens: 5 })}\n`);
    expect(await sessionTokens(projects, cwd, ["s1", "missing"])).toEqual({
      s1: { input: 1, output: 7, cacheWrite: 0, cacheRead: 0 },
      missing: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    });
  });
});
