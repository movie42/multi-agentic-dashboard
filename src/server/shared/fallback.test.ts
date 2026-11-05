import { describe, expect, it, vi } from "vitest";
import { isMissing, missingOr, parseJson, reportAnd } from "./fallback";

describe("fallback helpers", () => {
  it("treats ENOENT/ENOTDIR as an expected miss and reports anything else", () => {
    const report = vi.fn();
    const handle = missingOr([], report, "scope", { file: "f" });
    expect(handle(Object.assign(new Error("gone"), { code: "ENOENT" }))).toEqual([]);
    expect(report).not.toHaveBeenCalled();
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    expect(handle(denied)).toEqual([]);
    expect(report).toHaveBeenCalledWith("scope", denied, { file: "f" });
    expect(isMissing("ENOENT")).toBe(false);
  });

  it("always reports with reportAnd", () => {
    const report = vi.fn();
    expect(reportAnd(null, report, "s")(new Error("x"))).toBeNull();
    expect(report).toHaveBeenCalledOnce();
  });

  it("parses JSON or returns undefined", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson("{broken")).toBeUndefined();
  });
});
