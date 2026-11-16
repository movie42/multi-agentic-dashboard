import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { latestActivity, readRunningSubagents, SUBAGENT_STALE_MS } from "./subagents";

const assistant = (content: unknown[]) => JSON.stringify({ type: "assistant", message: { role: "assistant", content } });

describe("subagents", () => {
  it("describes the latest step as its tool call, or its text", () => {
    const tail = [assistant([{ type: "text", text: "먼저 볼게요" }]), assistant([{ type: "tool_use", name: "Bash", input: { command: "git diff", description: "Check the diff" } }]), "{broken"].join("\n");
    expect(latestActivity(tail)).toBe("Bash · Check the diff");
    expect(latestActivity(assistant([{ type: "text", text: "리뷰를 마쳤어요" }]))).toBe("리뷰를 마쳤어요");
  });

  it("lists only unfinished subagents whose file is still moving", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "subagents-"));
    const dir = path.join(root, "s1", "subagents");
    await mkdir(dir, { recursive: true });
    const add = async (id: string, meta: object, mtime: number) => {
      await writeFile(path.join(dir, `agent-${id}.meta.json`), JSON.stringify(meta));
      const file = path.join(dir, `agent-${id}.jsonl`);
      await writeFile(file, `${assistant([{ type: "tool_use", name: "Read", input: { file_path: "/a.ts" } }])}\n`);
      await utimes(file, mtime / 1000, mtime / 1000);
    };
    const now = Date.now();
    await add("run", { description: "Review the diff", agentType: "fork" }, now);
    await add("done", { description: "Done", agentType: "fork", finished: true }, now);
    await add("stale", { description: "Old", agentType: "fork" }, now - SUBAGENT_STALE_MS - 1000);
    const runs = await readRunningSubagents(path.join(root, "s1.jsonl"), now);
    expect(runs).toEqual([expect.objectContaining({ id: "run", description: "Review the diff", agentType: "fork", activity: "Read · /a.ts" })]);
  });
});
