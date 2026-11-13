import { describe, expect, it } from "vitest";
import { headFacts, locatorTail, summarizeSession, tailFacts, titlesIn } from "./summarize";
import { humanPrompt } from "./transcriptText";
import { parseBookmarkLines, sbTimestamp } from "./BookmarkStore";

const line = (value: unknown) => JSON.stringify(value);
const user = (content: unknown, extra: Record<string, unknown> = {}) => line({ type: "user", message: { role: "user", content }, ...extra });
const assistant = (text: string | null) => line({ type: "assistant", message: { content: text === null ? [] : [{ type: "text", text }] } });

describe("humanPrompt", () => {
  it.each([
    ["  hi  ", "hi"],
    ["<command-name>/flow</command-name><command-args>next</command-args>", "/flow next"],
    ["<command-name>/clear</command-name>", null],
    ["<system-reminder>x</system-reminder>", null],
    ["Caveat: The messages below were generated", null],
  ])("%j → %j", (text, expected) => {
    expect(humanPrompt(text)).toBe(expected);
  });
});

describe("headFacts", () => {
  it("skips housekeeping prompts and sidechains, and detects how the session started", () => {
    const facts = headFacts([
      line({ type: "user", isSidechain: true, cwd: "/side", message: { role: "user", content: "side" } }),
      user("<command-name>/clear</command-name>", { cwd: "/w", gitBranch: "main", timestamp: "2026-11-04T00:00:00.000Z", promptSource: "system" }),
      user("real prompt"),
      "not json",
    ]);
    expect(facts).toEqual({
      cwd: "/w",
      gitBranch: "main",
      startedAt: Date.parse("2026-11-04T00:00:00.000Z"),
      firstPrompt: "real prompt",
      origin: "spawned",
    });
  });
});

describe("tailFacts", () => {
  it("takes the newest non-empty prompt and reply, and the newest branch", () => {
    expect(
      tailFacts([
        assistant("older reply"),
        line({ type: "last-prompt", lastPrompt: "queued prompt", gitBranch: "feat/x" }),
        user("<command-name>/clear</command-name>"),
        assistant(null),
      ]),
    ).toEqual({ lastPrompt: "queued prompt", lastMessage: "older reply", gitBranch: "feat/x" });
  });
});

describe("summarizeSession", () => {
  it("returns null without any human prompt and falls back to the prompt as the title", () => {
    const source = { file: "/p/abc.jsonl", size: 10, mtimeMs: 5, head: "", tail: "" };
    expect(summarizeSession(source, { custom: null, ai: null })).toBeNull();
    const head = user("  a   long\nprompt  ", { cwd: "/w/repo", gitBranch: "HEAD" });
    expect(summarizeSession({ ...source, head, tail: head }, { custom: null, ai: null })).toMatchObject({
      sessionId: "abc",
      title: "a long prompt",
      titleSource: "none",
      project: "repo",
      gitBranch: null,
    });
  });
});

describe("titlesIn", () => {
  it("keeps the newest custom and ai titles", () => {
    const titles = titlesIn(
      [line({ type: "ai-title", aiTitle: "a1" }), line({ type: "custom-title", customTitle: "c1" }), line({ type: "ai-title", aiTitle: "a2" })],
      { custom: null, ai: null },
    );
    expect(titles).toEqual({ custom: "c1", ai: "a2" });
  });
});

describe("locatorTail", () => {
  it("collects up to 20 typed prompts newest first, queue operations included", () => {
    const lines = [
      ...Array.from({ length: 25 }, (_, index) => user(`prompt   ${index}`)),
      line({ type: "queue-operation", content: "queued" }),
      assistant("final"),
    ];
    const tail = locatorTail(lines);
    expect(tail.lastAssistant).toBe("final");
    expect(tail.recentUser).toHaveLength(20);
    expect(tail.recentUser.slice(0, 2)).toEqual(["queued", "prompt 24"]);
  });
});

describe("bookmark lines", () => {
  it("parses sb lines, warning on broken JSON and dropping incomplete records", () => {
    const warnings: unknown[] = [];
    const lines = parseBookmarkLines(
      `${line({ provider: "claude", name: "n", session_id: "s", cwd: "/", created_at: "t" })}\n{broken\n${line({ name: "x" })}\n\n`,
      (_scope, error) => warnings.push(error),
    );
    expect(lines.map((entry) => entry.session_id)).toEqual(["s"]);
    expect(warnings).toEqual(["skipped a malformed line"]);
    expect(sbTimestamp(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02 03:04");
  });
});
