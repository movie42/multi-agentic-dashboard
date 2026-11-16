import { describe, expect, it } from "vitest";
import { lastAnswerInTranscript, lastAnswerOf } from "./lastAnswer.ts";

const line = (value: unknown) => JSON.stringify(value);

describe("lastAnswer", () => {
  it("takes the last assistant text, skipping tool-only turns and broken lines", () => {
    const raw = [
      line({ type: "assistant", message: { content: [{ type: "text", text: "first" }] } }),
      line({ type: "user", message: { content: "next" } }),
      line({ type: "assistant", message: { content: [{ type: "text", text: "final answer" }] } }),
      line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }),
      "{broken",
    ].join("\n");
    expect(lastAnswerInTranscript(raw)).toBe("final answer");
  });

  it("prefers the answer the Stop payload carries", async () => {
    expect(await lastAnswerOf({ last_assistant_message: "direct", transcript_path: "/x" }, async () => "")).toBe("direct");
  });

  it("falls back to the transcript file and survives a missing file", async () => {
    const raw = line({ type: "assistant", message: { content: [{ type: "text", text: "from file" }] } });
    expect(await lastAnswerOf({ transcript_path: "/t.jsonl" }, async () => raw)).toBe("from file");
    expect(
      await lastAnswerOf({ transcript_path: "/t.jsonl" }, async () => {
        throw new Error("ENOENT");
      }),
    ).toBeNull();
  });
});
