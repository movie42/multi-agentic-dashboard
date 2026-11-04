import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stepsOf } from "./activity";

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
