import path from "node:path";
import type { ExecFileFn } from "@/server/shared/ports";

// The daemon launches Claude with `--session-id <runner id>` (or `--resume <runner id>` when it
// reopens a session), so a process's arguments tell which runner session it belongs to.
const RUNNER_ARG = /\s--(?:session-id|resume)\s+([0-9a-f-]{36})\s+--settings\s/;

export interface LiveConversationDeps {
  execFile: ExecFileFn;
  readFile: (file: string) => Promise<string>;
  /** `~/.claude/sessions`: Claude Code keeps `<pid>.json` there with the session it is on now. */
  sessionsDir: string;
}

function sessionIdOf(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("sessionId" in parsed)) return null;
    return typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : null;
  } catch {
    return null;
  }
}

/**
 * Maps runner session id → the Claude Code session its process is on now. The two differ after
 * `/resume` or `/clear` inside the terminal.
 */
export async function liveConversations({ execFile, readFile, sessionsDir }: LiveConversationDeps): Promise<Map<string, string>> {
  const { stdout } = await execFile("ps", ["-axo", "pid=,command="], { maxBuffer: 16 * 1024 * 1024 });
  const runnerOfPid = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    const runnerId = match?.[2]?.match(RUNNER_ARG)?.[1];
    if (match?.[1] && runnerId) runnerOfPid.set(match[1], runnerId);
  }
  const pairs = await Promise.all(
    [...runnerOfPid].map(async ([pid, runnerId]) => {
      const sessionId = await readFile(path.join(sessionsDir, `${pid}.json`)).then(sessionIdOf, () => null);
      return sessionId ? ([runnerId, sessionId] as const) : null;
    }),
  );
  return new Map(pairs.filter((pair) => pair !== null));
}
