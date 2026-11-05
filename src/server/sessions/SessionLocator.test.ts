import { describe, expect, it } from "vitest";
import { psOutputOf } from "./SessionLocator";

describe("psOutputOf", () => {
  it("keeps the rows ps printed when one of the pids is gone", () => {
    expect(psOutputOf(Object.assign(new Error("exit 1"), { code: 1, stdout: "123 claude ORCA_AGENT_PANE=a:b\n" }))).toBe("123 claude ORCA_AGENT_PANE=a:b\n");
  });

  it("rethrows other failures", () => {
    const error = Object.assign(new Error("spawn"), { code: "ENOENT" });
    expect(() => psOutputOf(error)).toThrow(error);
  });
});
