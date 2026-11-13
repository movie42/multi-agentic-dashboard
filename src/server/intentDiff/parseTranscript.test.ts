import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTranscript } from "./parseTranscript";

const raw = readFileSync(path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl"), "utf8");

describe("parseTranscript", () => {
  it("matches the current events for a local transcript", () => {
    expect(parseTranscript(raw, ["/repo"], true)).toMatchSnapshot();
  });

  it("drops relative shell commands from another checkout", () => {
    const events = parseTranscript(raw, ["/repo"], false);
    expect(events.filter((event) => event.tool === "Bash").map((event) => event.command)).toEqual([null, null]);
  });

  it("records no change for an edit whose tool result is an error", () => {
    const failed = [
      { type: "assistant", uuid: "a1", sessionId: "s", timestamp: "2026-11-04T10:00:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t-fail", name: "Edit", input: { file_path: "/repo/a.ts", old_string: "x", new_string: "y" } }] } },
      { type: "user", uuid: "u1", sessionId: "s", timestamp: "2026-11-04T10:00:01.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t-fail", content: "old_string not found", is_error: true }] } },
    ].map((line) => JSON.stringify(line)).join("\n");
    const [edit] = parseTranscript(failed, ["/repo"], true);
    expect(edit?.changes).toEqual({});
  });
});
