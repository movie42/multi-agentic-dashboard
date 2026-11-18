export interface DevPort {
  port: number;
  pid: number;
  /** Process name as `lsof` reports it (`node`, `bun`, `python3.12`). */
  command: string;
  /** Top of the git worktree the process was started in. */
  worktreePath: string;
}

export type DevPortsResponse = { ok: true; ports: DevPort[] } | { ok: false; error: string };
