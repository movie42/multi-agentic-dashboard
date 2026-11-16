import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chatItemsOf, inputDetail, stepsOf } from "./activitySteps";

const lines = readFileSync(path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl"), "utf8").split("\n");

describe("stepsOf", () => {
  it("matches the current activity steps", () => {
    expect(stepsOf(lines)).toMatchSnapshot();
  });

  it("keeps only the last 40 steps", () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      JSON.stringify({ type: "user", uuid: `u${index}`, message: { content: `prompt ${index}` } }),
    );
    const steps = stepsOf(many);
    expect(steps).toHaveLength(40);
    expect(steps[0]).toMatchObject({ kind: "prompt", text: "prompt 5" });
  });
});

describe("chatItemsOf", () => {
  it("keeps answers whole and shows each tool's input", () => {
    const long = "가".repeat(900);
    const chat = chatItemsOf([
      JSON.stringify({ type: "user", uuid: "u1", message: { content: "질문" } }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        message: {
          content: [
            { type: "text", text: long },
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/repo/a.ts", limit: 20 } },
          ],
        },
      }),
    ]);
    expect(chat.map((item) => item.kind)).toEqual(["prompt", "text", "tool"]);
    expect(chat[1]).toMatchObject({ kind: "text", text: long });
    expect(chat[2]).toMatchObject({ kind: "tool", name: "Read", detail: JSON.stringify({ file_path: "/repo/a.ts", limit: 20 }, null, 2) });
  });

  it("shows a command as it is", () => {
    expect(inputDetail({ command: "git status", description: "x" })).toBe("git status");
    expect(inputDetail({})).toBeNull();
  });
});

describe("chatItemsOf local commands", () => {
  const line = (entry: Record<string, unknown>) => JSON.stringify({ uuid: "u", timestamp: "2026-11-16T00:00:00Z", ...entry });

  it("shows typed slash commands, their output and shell commands", () => {
    const steps = chatItemsOf([
      line({ type: "user", isMeta: true, message: { content: "<local-command-caveat>x</local-command-caveat>" } }),
      line({ uuid: "a", type: "user", message: { content: "<command-name>/context</command-name>\n<command-message>context</command-message>\n<command-args></command-args>" } }),
      line({ uuid: "b", type: "system", subtype: "local_command", content: "<local-command-stdout>\u001b[2mContext 12%\u001b[0m</local-command-stdout>" }),
      line({ uuid: "c", type: "system", subtype: "local_command", content: "<local-command-stdout></local-command-stdout>" }),
      line({ uuid: "d", type: "user", message: { content: "<bash-input>git status</bash-input>" } }),
      line({ uuid: "e", type: "user", message: { content: "<bash-stdout>clean</bash-stdout><bash-stderr>warn</bash-stderr>" } }),
    ]);
    const shown = steps.map((step) =>
      step.kind === "tool" ? { kind: step.kind } : { kind: step.kind, text: step.text, error: step.kind === "output" ? step.error : undefined },
    );
    expect(shown).toEqual([
      { kind: "prompt", text: "/context", error: undefined },
      { kind: "output", text: "Context 12%", error: false },
      { kind: "prompt", text: "! git status", error: undefined },
      { kind: "output", text: "clean", error: false },
      { kind: "output", text: "warn", error: true },
    ]);
  });

  it("keeps the activity timeline free of them", () => {
    expect(stepsOf([line({ type: "user", message: { content: "<command-name>/context</command-name>" } })])).toEqual([]);
  });
});
