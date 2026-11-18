import { execFile } from "node:child_process";

export type ReadCommand = (file: string, args: string[]) => Promise<string>;

export const readCommand: ReadCommand = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 5000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
      // lsof exits 1 when nothing matches but still prints what it found.
      if (error && !stdout) reject(error);
      else resolve(stdout);
    });
  });

/** `ps -A -o pid=,ppid=` → child pid → parent pid. */
export function parseParents(output: string): Map<number, number> {
  return new Map(
    output.split("\n").flatMap((line): [number, number][] => {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      return pid && ppid !== undefined && Number.isInteger(ppid) ? [[pid, ppid]] : [];
    }),
  );
}

/** `lsof -Fpn` listening sockets → pid → ports. */
export function parseListening(output: string): Map<number, number[]> {
  const ports = new Map<number, number[]>();
  // eslint-disable-next-line no-restricted-syntax -- the pid the following `n` lines belong to
  let pid: number | null = null;
  output.split("\n").forEach((line) => {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== null) {
      const port = Number(line.slice(line.lastIndexOf(":") + 1));
      const known = ports.get(pid) ?? [];
      if (Number.isInteger(port) && port > 0 && !known.includes(port)) ports.set(pid, [...known, port]);
    }
  });
  return ports;
}

const MAX_DEPTH = 64;

function isUnder(pid: number, root: number, parents: ReadonlyMap<number, number>, depth = 0): boolean {
  if (pid === root) return true;
  const parent = parents.get(pid);
  return parent !== undefined && parent > 1 && depth < MAX_DEPTH && isUnder(parent, root, parents, depth + 1);
}

/** Ports each shell's descendants listen on, keyed by shell pid. */
export async function portsUnder(shellPids: number[], read: ReadCommand = readCommand): Promise<Map<number, number[]>> {
  if (shellPids.length === 0) return new Map();
  const [listing, tree] = await Promise.all([read("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]), read("ps", ["-A", "-o", "pid=,ppid="])]);
  const listening = parseListening(listing);
  const parents = parseParents(tree);
  return new Map(
    shellPids.map((shell) => {
      const ports = [...listening].flatMap(([pid, list]) => (isUnder(pid, shell, parents) ? list : []));
      return [shell, [...new Set(ports)].sort((a, b) => a - b)];
    }),
  );
}
