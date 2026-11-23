import { describe, expect, it, vi } from "vitest";
import { fakeExecFile } from "@/server/shared/fakes";
import { DevPortReader, isDevServer, parseCwds, parseListeners } from "./readDevPorts";

describe("parseListeners", () => {
  it("reads one entry per pid and port", () => {
    const output = ["p10", "cnode", "f20", "n127.0.0.1:3000", "f21", "n[::1]:3000", "p11", "cbun", "f9", "n*:5173", ""].join("\n");
    expect(parseListeners(output)).toEqual([
      { pid: 10, command: "node", port: 3000 },
      { pid: 11, command: "bun", port: 5173 },
    ]);
  });
});

describe("parseCwds", () => {
  it("maps pid to working directory", () => {
    expect(parseCwds("p10\nfcwd\nn/repo\np11\nfcwd\nn/other\n")).toEqual(new Map([[10, "/repo"], [11, "/other"]]));
  });
});

describe("isDevServer", () => {
  it("keeps dev runtimes on fixed ports only", () => {
    expect(isDevServer({ pid: 1, command: "node", port: 3000 })).toBe(true);
    expect(isDevServer({ pid: 1, command: "next-serv", port: 3100 })).toBe(true);
    expect(isDevServer({ pid: 1, command: "2.1.327", port: 3000 })).toBe(false);
    expect(isDevServer({ pid: 1, command: "OrbStack Helper", port: 3306 })).toBe(false);
    expect(isDevServer({ pid: 1, command: "node", port: 60123 })).toBe(false);
    expect(isDevServer({ pid: 1, command: "node", port: 3198 })).toBe(false);
  });
});

describe("DevPortReader.stop", () => {
  const exec = fakeExecFile(({ file, args }) => {
    if (file === "git") return "/repo\n";
    if (args.includes("-sTCP:LISTEN")) return "p4242\ncnode\nn*:8081\n";
    return "p4242\nn/repo/app\n";
  });

  it("ends the process behind a port this worktree shows", async () => {
    const kill = vi.fn();
    await new DevPortReader(exec, kill).stop(4242, 8081);
    expect(kill).toHaveBeenCalledWith(4242, "SIGTERM");
  });

  it("refuses a pid that is not listening as a dev server", async () => {
    const kill = vi.fn();
    await expect(new DevPortReader(exec, kill).stop(1, 8081)).rejects.toThrow("듣고 있는 개발 서버가 아니에요");
    expect(kill).not.toHaveBeenCalled();
  });
});
