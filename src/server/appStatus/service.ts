import "server-only";
import { APP_BUILD_COMMAND, type AppStatus, type BranchStatus } from "@/common/appStatus/types";
import { RUNNER_PORT } from "@/common/runner/types";
import type { RunnerClient } from "@/server/runner/RunnerClient";
import { RUNNER_BASE_URL } from "@/server/runner/spawnDaemon";
import { DaemonRestarter, stopDaemonOnPort } from "./DaemonRestarter";
import { agentControlRepo, readBranchStatus, readBuildInfo, readDaemonSide } from "./readAppStatus";

const PROMPT_WAIT_MS = 5000;
const PROMPT_POLL_MS = 200;

type ShellRunner = Pick<RunnerClient, "launch" | "screen" | "input">;

export async function runInShell(runner: ShellRunner, cwd: string, command: string): Promise<string> {
  const session = await runner.launch({ cwd, kind: "shell" });
  const deadline = Date.now() + PROMPT_WAIT_MS;
  while (Date.now() < deadline) {
    const lines = await runner.screen(session.id).catch(() => []);
    if (lines.some((line) => line.trim().length > 0)) break;
    await new Promise((resolve) => setTimeout(resolve, PROMPT_POLL_MS));
  }
  await runner.input(session.id, { text: `${command}\r`, raw: true });
  return session.id;
}

export interface AppStatusService {
  read: () => Promise<AppStatus>;
  restarter: DaemonRestarter;
  buildApp: () => Promise<string>;
  runInShell: (cwd: string, command: string) => Promise<string>;
  branchStatus: (worktreePath: string) => Promise<BranchStatus>;
}

export function createAppStatusService(runner: RunnerClient): AppStatusService {
  const port = Number(process.env.RUNNER_PORT ?? RUNNER_PORT);
  const workingCount = async () => (await runner.list()).filter((session) => session.status === "working").length;
  const restarter = new DaemonRestarter({
    workingCount,
    stop: () => stopDaemonOnPort(port),
    start: async () => {
      await runner.list();
    },
  });
  return {
    restarter,
    buildApp: () => runInShell(runner, agentControlRepo(), APP_BUILD_COMMAND),
    runInShell: (cwd, command) => runInShell(runner, cwd, command),
    branchStatus: (worktreePath) => readBranchStatus(worktreePath),
    async read() {
      const repoPath = agentControlRepo();
      const [checkout, build, daemon] = await Promise.all([readBranchStatus(repoPath), readBuildInfo(), readDaemonSide(RUNNER_BASE_URL)]);
      const working = daemon.kind === "running" ? await workingCount().catch(() => 0) : 0;
      return {
        repoPath,
        checkout,
        app: build ? { kind: "built", ...build } : { kind: "dev" },
        daemon,
        workingSessions: working,
        restart: restarter.state(),
      };
    },
  };
}
