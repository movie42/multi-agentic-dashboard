import { describe, expect, it } from "vitest";
import { parseStatusLine } from "./statusLine.ts";

describe("parseStatusLine", () => {
  it("reads the model, the context share and both usage windows", () => {
    const report = parseStatusLine({
      model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
      context_window: { used_percentage: 41.6, context_window_size: 200000 },
      rate_limits: {
        five_hour: { used_percentage: 12.4, resets_at: 1_800_000_000 },
        seven_day: { used_percentage: 63, resets_at: "2027-01-01T00:00:00Z" },
      },
    });
    expect(report).toEqual({
      model: "Opus 5.5",
      contextPercent: 42,
      usage: {
        session: { percent: 12, resetsAt: new Date(1_800_000_000_000).toISOString() },
        weekly: { percent: 63, resetsAt: "2027-01-01T00:00:00Z" },
      },
    });
  });

  it("works out the context share from token counts when no percentage is given", () => {
    const report = parseStatusLine({
      context_window: {
        context_window_size: 200000,
        current_usage: { input_tokens: 1000, cache_creation_input_tokens: 9000, cache_read_input_tokens: 40000, output_tokens: 500 },
      },
    });
    expect(report?.contextPercent).toBe(25);
    expect(report?.usage).toBeNull();
    expect(report?.model).toBeNull();
  });

  it("ignores a body that is not an object", () => {
    expect(parseStatusLine(null)).toBeNull();
    expect(parseStatusLine("x")).toBeNull();
  });
});
