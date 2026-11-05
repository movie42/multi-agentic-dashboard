import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { describeError, ErrorLog } from "./errorLog";

async function tempFile(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "error-log-")), "logs", "app.log");
}

describe("ErrorLog", () => {
  it("writes one JSON line per entry and still prints to the console", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const file = await tempFile();
    const log = new ErrorLog(file, 1024, () => new Date("2026-11-04T00:00:00.000Z"));
    log.record("error", "board", new Error("orca failed"), { worktree: "/w" });
    await log.flush();
    const [line] = (await readFile(file, "utf8")).trim().split("\n");
    expect(JSON.parse(line ?? "")).toMatchObject({
      at: "2026-11-04T00:00:00.000Z",
      level: "error",
      scope: "board",
      message: "orca failed",
      context: { worktree: "/w" },
    });
    expect(error).toHaveBeenCalledOnce();
  });

  it("rotates to a single backup once the file reaches the limit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = await tempFile();
    const log = new ErrorLog(file, 10);
    log.record("warn", "a", "first");
    await log.flush();
    await writeFile(`${file}.1`, "older backup");
    log.record("warn", "b", "second");
    await log.flush();
    expect(JSON.parse(await readFile(`${file}.1`, "utf8")).message).toBe("first");
    expect(JSON.parse(await readFile(file, "utf8")).message).toBe("second");
  });

  it("reports a failed write instead of swallowing it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = new ErrorLog("/dev/null/cannot/app.log", 10);
    log.record("error", "x", "boom");
    await log.flush();
    expect(error).toHaveBeenLastCalledWith("[error-log] write failed", "/dev/null/cannot/app.log", expect.anything());
  });
});

describe("describeError", () => {
  it("handles errors, strings and other values", () => {
    expect(describeError("plain")).toEqual({ message: "plain", stack: null });
    expect(describeError({ code: 1 })).toEqual({ message: '{"code":1}', stack: null });
    expect(describeError(new Error("e")).message).toBe("e");
  });
});
