import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectDirOf } from "./paths";
import { SessionTranscripts } from "./SessionTranscripts";

const CWD = "/w";
let projectsDir: string;
let file: string;

const user = (text: string) => JSON.stringify({ type: "user", message: { content: text } }) + "\n";
const assistant = (text: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] }, ...extra }) + "\n";

beforeEach(async () => {
  projectsDir = await mkdtemp(path.join(tmpdir(), "transcripts-"));
  await mkdir(projectDirOf(projectsDir, CWD), { recursive: true });
  file = path.join(projectDirOf(projectsDir, CWD), "s1.jsonl");
});

afterEach(async () => {
  await rm(projectsDir, { recursive: true, force: true });
});

describe("SessionTranscripts", () => {
  it("keeps every link-bearing reply of the conversation, newest first", async () => {
    await writeFile(
      file,
      user("make it") +
        assistant("Saved [shot](/tmp/fold-p2.png)") +
        assistant("side", { isSidechain: true }) +
        assistant("No links here") +
        assistant("Report at /w/report.md"),
    );
    const transcripts = new SessionTranscripts(projectsDir, vi.fn());
    const facts = await transcripts.read(CWD, "s1");
    expect(facts?.lastAssistant).toBe("Report at /w/report.md");
    expect(facts?.linkMessages).toEqual(["Report at /w/report.md", "Saved [shot](/tmp/fold-p2.png)"]);
  });

  it("adds replies appended after the last read without losing earlier ones", async () => {
    await writeFile(file, user("make it") + assistant("Saved /tmp/a.png"));
    const transcripts = new SessionTranscripts(projectsDir, vi.fn());
    await transcripts.read(CWD, "s1");
    await appendFile(file, assistant("Done, nothing to link") + assistant("See https://claude.ai/code/artifact/x"));
    const facts = await transcripts.read(CWD, "s1");
    expect(facts?.lastAssistant).toBe("See https://claude.ai/code/artifact/x");
    expect(facts?.linkMessages).toEqual(["See https://claude.ai/code/artifact/x", "Saved /tmp/a.png"]);
  });
});
