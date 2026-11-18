import type { AgentCard } from "@/common/board/types";

export type ShellStatus =
  | { kind: "serving"; command: string; ports: number[] }
  | { kind: "running"; command: string }
  | { kind: "failed"; command: string; code: number };

/** What a shell card shows instead of "쉬는 중"; null at the prompt after a clean exit, or without command marks. */
export function shellStatusOf(agent: AgentCard): ShellStatus | null {
  const shell = agent.shell;
  if (!shell) return null;
  if (shell.running) {
    return shell.ports.length > 0
      ? { kind: "serving", command: shell.running.command, ports: shell.ports }
      : { kind: "running", command: shell.running.command };
  }
  if (shell.lastExit && shell.lastExit.code !== 0) return { kind: "failed", command: shell.lastExit.command, code: shell.lastExit.code };
  return null;
}

export function shellStatusLabel(status: ShellStatus): string {
  if (status.kind === "serving") return `서버 ${status.ports.map((port) => `:${port}`).join(" ")}`;
  if (status.kind === "running") return "실행 중";
  return `실패 · 코드 ${status.code}`;
}
