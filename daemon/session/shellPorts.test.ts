import { describe, expect, it } from "vitest";
import { portsUnder } from "./shellPorts.ts";

describe("portsUnder", () => {
  it("finds the ports of a shell's grandchildren and leaves other processes out", async () => {
    const outputs: Record<string, string> = {
      lsof: "p300\nn*:3199\nn[::1]:3199\np400\nn127.0.0.1:5432\n",
      ps: "  100     1\n  200   100\n  300   200\n  400     1\n",
    };
    const ports = await portsUnder([100], async (file) => outputs[file] ?? "");
    expect(ports.get(100)).toEqual([3199]);
  });
});
