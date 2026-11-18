import { describe, expect, it } from "vitest";
import type { AgentCard } from "@/common/board/types";
import { shellStatusLabel, shellStatusOf } from "./shellStatus";

const card = (shell: AgentCard["shell"]): AgentCard => ({ shell }) as AgentCard;

describe("shellStatusOf", () => {
  it("names a running command with ports a server", () => {
    const status = shellStatusOf(card({ integrated: true, running: { command: "p dev", since: 1 }, lastExit: null, ports: [3199] }));
    expect(status && shellStatusLabel(status)).toBe("서버 :3199");
  });

  it("shows a failed last command and stays quiet after a clean one", () => {
    const failed = shellStatusOf(card({ integrated: true, running: null, lastExit: { command: "bun run build", code: 1, at: 1 }, ports: [] }));
    expect(failed && shellStatusLabel(failed)).toBe("실패 · 코드 1");
    expect(shellStatusOf(card({ integrated: true, running: null, lastExit: { command: "ls", code: 0, at: 1 }, ports: [] }))).toBeNull();
    expect(shellStatusOf(card(null))).toBeNull();
  });
});
