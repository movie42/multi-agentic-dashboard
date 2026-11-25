import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunnerSession } from "@/common/runner/types";
import { recordCloses } from "./recordCloses";
import { TokenLedger } from "./TokenLedger";

const session = (patch: Partial<RunnerSession>): RunnerSession => ({
  id: "r1",
  cwd: "/Users/me/todo-hub",
  kind: "claude",
  status: "idle",
  interrupted: false,
  prompted: true,
  startedAt: 0,
  updatedAt: 0,
  exitCode: null,
  model: null,
  contextPercent: null,
  effort: null,
  permissionMode: null,
  conversationId: null,
  permission: null,
  orchestration: null,
  ...patch,
});

describe("recordCloses", () => {
  it("counts a closed Claude session under its runner id and the conversation it moved to; shells add nothing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "closes-"));
    const projectsDir = path.join(root, "projects");
    const dir = path.join(projectsDir, "-Users-me-todo-hub");
    await mkdir(dir, { recursive: true });
    const line = (id: string, output: number) => JSON.stringify({ type: "assistant", message: { id, usage: { output_tokens: output } } });
    await writeFile(path.join(dir, "r1.jsonl"), `${line("m1", 100)}\n`);
    await writeFile(path.join(dir, "c2.jsonl"), `${line("m2", 50)}\n`);
    const ledger = new TokenLedger(path.join(root, "ledger.json"), () => {});

    await recordCloses({ ledger, projectsDir }, [
      session({ conversationId: "c2" }),
      session({ id: "sh", kind: "shell", cwd: "/Users/me/todo-hub" }),
    ]);

    expect(await ledger.read()).toEqual({ total: { input: 0, output: 150, cacheWrite: 0, cacheRead: 0 } });
  });
});
