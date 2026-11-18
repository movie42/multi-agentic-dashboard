import { describe, expect, it } from "vitest";
import { readShellMarks } from "./shellIntegration.ts";

describe("readShellMarks", () => {
  it("reads ready, start and end marks between ordinary output", () => {
    const { marks, carry } = readShellMarks("", "\x1b]633;A\x07$ \x1b]633;C;bun run build\x07building…\r\nerror\r\n\x1b]633;D;1\x07$ ");
    expect(marks).toEqual([{ kind: "ready" }, { kind: "start", command: "bun run build" }, { kind: "end", code: 1 }]);
    expect(carry).toBe("");
  });

  it("joins a mark cut between two chunks", () => {
    const first = readShellMarks("", "done\r\n\x1b]63");
    expect(first.marks).toEqual([]);
    const second = readShellMarks(first.carry, "3;D;0\x07$ ");
    expect(second.marks).toEqual([{ kind: "end", code: 0 }]);
  });
});
