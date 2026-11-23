import "server-only";
import type { DevPort } from "@/common/devPorts/types";
import { RUNNER_PORT } from "@/common/runner/types";
import { nodeExecFile, type ExecFileFn } from "@/server/shared/ports";

export interface Listener {
  pid: number;
  command: string;
  port: number;
}

/** Parses `lsof -Fpcn` output: `p<pid>`, `c<command>`, then one `n<address>` per open socket. */
export function parseListeners(output: string): Listener[] {
  const found: Listener[] = [];
  const seen = new Set<string>();
  // eslint-disable-next-line no-restricted-syntax -- the process the following `n` lines belong to
  let current: { pid: number; command: string } | null = null;
  output.split("\n").forEach((line) => {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === "p") current = { pid: Number(value), command: "" };
    else if (tag === "c" && current) current = { ...current, command: value };
    else if (tag === "n" && current) {
      const port = Number(value.slice(value.lastIndexOf(":") + 1));
      const key = `${current.pid}:${port}`;
      if (!Number.isInteger(port) || port <= 0 || seen.has(key)) return;
      seen.add(key);
      found.push({ pid: current.pid, command: current.command, port });
    }
  });
  return found;
}

/** Parses `lsof -d cwd -Fpn` output into pid → working directory. */
export function parseCwds(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  // eslint-disable-next-line no-restricted-syntax -- the pid the following `n` line belongs to
  let pid: number | null = null;
  output.split("\n").forEach((line) => {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== null) cwds.set(pid, line.slice(1));
  });
  return cwds;
}

const CACHE_MS = 3000;
// lsof truncates process names (`next-serv`). Claude Code itself shows up under its version number
// (`2.1.327`) with editor/MCP sockets, and Docker helpers keep the cwd they were started from.
const DEV_RUNTIME = /^(node|bun|deno|python|ruby|php|java|next-serv|vite|uvicorn|gunicorn|puma|rails|hugo|caddy|go$)/i;
// macOS hands out 49152+ for ephemeral sockets; a dev server is started on a fixed lower port.
const EPHEMERAL_START = 49152;

export function isDevServer(listener: Listener): boolean {
  return DEV_RUNTIME.test(listener.command) && listener.port < EPHEMERAL_START && listener.port !== RUNNER_PORT;
}

type KillFn = (pid: number, signal: NodeJS.Signals) => void;

export class DevPortReader {
  #exec: ExecFileFn;
  #cached: { at: number; ports: Promise<DevPort[]> } | null = null;
  #toplevels = new Map<string, string | null>();

  #kill: KillFn;

  constructor(exec: ExecFileFn = nodeExecFile, kill: KillFn = (pid, signal) => process.kill(pid, signal)) {
    this.#exec = exec;
    this.#kill = kill;
  }

  /** Ends a dev server, but only one the badge could have shown: a pid freshly seen listening on that port. */
  async stop(pid: number, port: number): Promise<void> {
    this.#cached = null;
    const listening = (await this.read()).some((entry) => entry.pid === pid && entry.port === port);
    if (!listening) throw new Error(`${port} 포트에서 듣고 있는 개발 서버가 아니에요 (pid ${pid})`);
    this.#kill(pid, "SIGTERM");
    this.#cached = null;
  }

  read(): Promise<DevPort[]> {
    const now = Date.now();
    if (this.#cached && now - this.#cached.at < CACHE_MS) return this.#cached.ports;
    const ports = this.#scan();
    this.#cached = { at: now, ports };
    ports.catch(() => {
      if (this.#cached?.ports === ports) this.#cached = null;
    });
    return ports;
  }

  async #run(args: string[]): Promise<string> {
    try {
      return (await this.#exec("lsof", args, { timeout: 5000, maxBuffer: 4 * 1024 * 1024 })).stdout;
    } catch (error) {
      // lsof exits 1 when nothing matches but still prints what it found.
      const stdout = typeof error === "object" && error !== null && "stdout" in error ? String(Reflect.get(error, "stdout")) : "";
      if (stdout) return stdout;
      throw error;
    }
  }

  async #scan(): Promise<DevPort[]> {
    const listeners = parseListeners(await this.#run(["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"])).filter(isDevServer);
    if (listeners.length === 0) return [];
    const pids = [...new Set(listeners.map((listener) => listener.pid))];
    const cwds = parseCwds(await this.#run(["-a", "-d", "cwd", "-p", pids.join(","), "-Fpn"]));
    const roots = await Promise.all(
      pids.map(async (pid) => [pid, await this.#toplevel(cwds.get(pid))] as const),
    );
    const rootOf = new Map(roots);
    return listeners
      .flatMap((listener) => {
        const worktreePath = rootOf.get(listener.pid);
        return worktreePath ? [{ ...listener, worktreePath }] : [];
      })
      .sort((a, b) => a.port - b.port);
  }

  async #toplevel(cwd: string | undefined): Promise<string | null> {
    if (!cwd || cwd === "/") return null;
    const known = this.#toplevels.get(cwd);
    if (known !== undefined) return known;
    const root = await this.#exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 3000 })
      .then(({ stdout }) => stdout.trim() || null)
      .catch(() => null);
    this.#toplevels.set(cwd, root);
    return root;
  }
}
