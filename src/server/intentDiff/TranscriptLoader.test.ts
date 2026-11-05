import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TranscriptLoader } from "./TranscriptLoader";

const fixture = path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl");

async function projectDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "transcripts-"));
  const raw = await readFile(fixture, "utf8");
  await writeFile(path.join(dir, "sess-1.jsonl"), raw);
  await mkdir(path.join(dir, "sess-1", "subagents"), { recursive: true });
  await writeFile(path.join(dir, "sess-1", "subagents", "agent-1.jsonl"), raw.replaceAll("sess-1", "sess-sub"));
  await writeFile(path.join(dir, "asked.jsonl"), raw.replaceAll("sess-1", "asked"));
  return dir;
}

describe("TranscriptLoader", () => {
  it("reads main and subagent transcripts, skipping ask sessions", async () => {
    const dir = await projectDir();
    const warn = vi.fn();
    const loader = new TranscriptLoader({ askSessionIds: async () => new Set(["asked"]), projectDirOf: () => dir, warn });
    const { events, sessionCount } = await loader.load(["/repo"], ["/repo"], 0, null);
    expect(sessionCount).toBe(2);
    expect(new Set(events.map((event) => event.sessionId))).toEqual(new Set(["sess-1", "sess-sub"]));
    expect(events.map((event) => event.at)).toEqual([...events.map((event) => event.at)].sort((a, b) => a - b));
    expect(warn).not.toHaveBeenCalled();
  });

  it("re-parses a file only when its mtime changes", async () => {
    const dir = await projectDir();
    const loader = new TranscriptLoader({ askSessionIds: async () => new Set(), projectDirOf: () => dir, warn: vi.fn() });
    const first = await loader.load(["/repo"], ["/repo"], 0, null);
    const file = path.join(dir, "sess-1.jsonl");
    await writeFile(file, "");
    await utimes(file, new Date(), new Date(1000));
    expect((await loader.load(["/repo"], ["/repo"], 0, null)).events.length).toBeLessThan(first.events.length);
  });

  it("returns nothing for a checkout without transcripts", async () => {
    const warn = vi.fn();
    const loader = new TranscriptLoader({ askSessionIds: async () => new Set(), projectDirOf: () => "/nope/none", warn });
    expect(await loader.load(["/repo"], ["/repo"], 0, null)).toEqual({ events: [], sessionCount: 0 });
    expect(warn).not.toHaveBeenCalled();
  });
});
