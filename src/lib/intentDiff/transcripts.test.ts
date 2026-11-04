import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcripts";

const raw = readFileSync(path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl"), "utf8");

describe("parseTranscript", () => {
  it("matches the current events for a local transcript", () => {
    expect(parseTranscript(raw, ["/repo"], true)).toMatchSnapshot();
  });

  it("drops relative shell commands from another checkout", () => {
    const events = parseTranscript(raw, ["/repo"], false);
    expect(events.filter((event) => event.tool === "Bash").map((event) => event.command)).toEqual([null, null]);
  });
});
