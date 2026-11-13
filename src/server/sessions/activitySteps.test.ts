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
