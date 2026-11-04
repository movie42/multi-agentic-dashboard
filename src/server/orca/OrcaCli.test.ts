import { z } from "zod";
import { describe, expect, it } from "vitest";
import { execError, fakeExecFile } from "@/server/shared/fakes";
import { OrcaCli, OrcaCliError, parseOrcaOutput } from "./OrcaCli";

describe("parseOrcaOutput", () => {
  it("returns the envelope result, validated when a schema is given", () => {
    expect(parseOrcaOutput(["x"], '{"ok":true,"result":{"a":1}}')).toEqual({ a: 1 });
    expect(parseOrcaOutput(["x"], '{"ok":true,"result":{"a":1}}', z.object({ a: z.number() }))).toEqual({ a: 1 });
  });

  it("throws OrcaCliError for non-JSON, bad envelopes, ok:false and schema mismatches", () => {
    expect(() => parseOrcaOutput(["x"], "nope")).toThrow(/non-JSON/);
    expect(() => parseOrcaOutput(["x"], "{}")).toThrow(/unexpected shape/);
    expect(() => parseOrcaOutput(["x"], '{"ok":false,"error":"boom"}')).toThrow(/orca x: boom/);
    expect(() => parseOrcaOutput(["x"], '{"ok":true,"result":{}}', z.object({ a: z.number() }))).toThrow(OrcaCliError);
  });
});

describe("OrcaCli", () => {
  it("appends --json and passes the timeout", async () => {
    const execFile = fakeExecFile(() => '{"ok":true,"result":1}');
    const cli = new OrcaCli("/bin/orca", execFile);
    expect(await cli.run(["status"], 5)).toBe(1);
    expect(execFile.calls[0]).toMatchObject({ file: "/bin/orca", args: ["status", "--json"], options: { timeout: 5 } });
    await cli.run(["status"], z.number());
    expect(execFile.calls[1].options?.timeout).toBe(15_000);
  });

  it("uses stdout from a failed process when present, otherwise throws", async () => {
    const withStdout = new OrcaCli(
      "/bin/orca",
      fakeExecFile(() => execError("exit 1", { stdout: '{"ok":false,"error":"no terminal"}' })),
    );
    await expect(withStdout.run(["terminal", "read"])).rejects.toThrow(/no terminal/);
    const empty = new OrcaCli("/bin/orca", fakeExecFile(() => execError("ENOENT", {})));
    await expect(empty.run(["status"])).rejects.toThrow(/failed: ENOENT/);
  });
});
