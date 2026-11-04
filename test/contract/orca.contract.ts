import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ORCA_DIR, prepareFixtures } from "../../e2e/fixtures";
import { orcaEnvelopeSchema, orcaStatusSchema, terminalListSchema, worktreePsSchema } from "@/server/orca/schema";

const ORCA_BIN = process.env.ORCA_BIN ?? "/Applications/Orca.app/Contents/Resources/bin/orca";

function realOrca(args: string[]): unknown {
  const envelope = orcaEnvelopeSchema.parse(JSON.parse(execFileSync(ORCA_BIN, [...args, "--json"], { encoding: "utf8" })));
  expect(envelope.ok).toBe(true);
  return envelope.result;
}

describe.skipIf(!existsSync(ORCA_BIN))("real orca output matches the dashboard schemas", () => {
  it("status", () => {
    expect(orcaStatusSchema.safeParse(realOrca(["status"])).error).toBeUndefined();
  });

  it("worktree ps", () => {
    expect(worktreePsSchema.safeParse(realOrca(["worktree", "ps", "--limit", "500"])).error).toBeUndefined();
  });

  it("terminal list", () => {
    expect(terminalListSchema.safeParse(realOrca(["terminal", "list"])).error).toBeUndefined();
  });
});

describe("e2e fake orca fixtures match the same schemas", () => {
  prepareFixtures();
  const fixture = (name: string): unknown => JSON.parse(readFileSync(path.join(ORCA_DIR, name), "utf8"));

  it("worktree ps", () => {
    expect(worktreePsSchema.safeParse(fixture("worktree-ps.json")).error).toBeUndefined();
  });

  it("terminal list", () => {
    expect(terminalListSchema.safeParse(fixture("terminal-list.json")).error).toBeUndefined();
  });
});
