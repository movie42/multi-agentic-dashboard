import "server-only";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { LRUCache } from "lru-cache";
import { projectDirOf } from "./paths";
import { liveSessionFileSchema } from "./schema";
import { locatorTail, type TailEntry } from "./summarize";
import { readTail } from "./transcriptFile";
import { flatten } from "./transcriptText";
import { missingOr, parseJson, reportAnd, type Report } from "../shared/fallback";

const LIVE_TTL_MS = 2_000;
const TAIL_BYTES = 512 * 1024;
const CANDIDATE_FILES = 8;
const MATCH_CHARS = 60;

export interface LocatedSession {
  file: string;
  size: number;
  lastAssistant: string | null;
}

interface LiveSession {
  sessionId: string;
  cwd: string;
}

type ProcessList = (pids: number[]) => Promise<string>;

export interface SessionLocatorOptions {
  projectsDir: string;
  liveSessionsDir: string;
  listProcesses?: ProcessList;
  warn: Report;
  now?: () => number;
}

const execFileAsync = promisify(execFile);

async function psCommands(pids: number[]): Promise<string> {
  const { stdout } = await execFileAsync("/bin/ps", ["eww", "-o", "pid=,command=", "-p", pids.join(",")], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export function panesFromPs(stdout: string, byPid: Map<number, LiveSession>): Map<string, LiveSession> {
  return new Map(
    stdout.split("\n").flatMap((line) => {
      const pid = Number(line.trim().split(/\s+/, 1)[0]);
      const pane = line.match(/\bORCA_AGENT_PANE=(\S+)/)?.[1];
      const live = byPid.get(pid);
      return pane && live ? [[pane, live] as const] : [];
    }),
  );
}

function needleOf(text: string | null): string | null {
  const needle = text ? flatten(text).slice(0, MATCH_CHARS) : "";
  return needle.length >= 10 ? needle : null;
}

export class SessionLocator {
  private readonly tails = new LRUCache<string, TailEntry & { mtimeMs: number }>({ max: 2_000 });
  private readonly paneFiles = new LRUCache<string, string>({ max: 2_000 });
  private live: { at: number; value: Promise<Map<string, LiveSession>> } | null = null;
  private readonly listProcesses: ProcessList;
  private readonly now: () => number;

  constructor(private readonly options: SessionLocatorOptions) {
    this.listProcesses = options.listProcesses ?? psCommands;
    this.now = options.now ?? Date.now;
  }

  projectDirOf(cwd: string): string {
    return projectDirOf(this.options.projectsDir, cwd);
  }

  async find(paneKey: string, cwd: string, preview: string | null, prompt: string | null): Promise<LocatedSession | null> {
    const located = (await this.liveSessionOf(paneKey)) ?? (await this.match(cwd, preview, prompt));
    if (located) {
      this.paneFiles.set(paneKey, located.file);
      return located;
    }
    const remembered = this.paneFiles.get(paneKey);
    const info = remembered ? await this.statOrNull(remembered) : null;
    if (!remembered || !info) return null;
    const tail = await this.safeTail(remembered, info.size, info.mtimeMs);
    return { file: remembered, size: info.size, lastAssistant: tail?.lastAssistant ?? null };
  }

  private async scanLiveSessions(): Promise<Map<string, LiveSession>> {
    const dir = this.options.liveSessionsDir;
    const names = await readdir(dir).catch(missingOr<string[]>([], this.options.warn, "sessions", { step: "live dir", dir }));
    const records = await Promise.all(
      names
        .filter((name) => /^\d+\.json$/.test(name))
        .map(async (name) => {
          const text = await readFile(path.join(dir, name), "utf8").catch(
            missingOr(null, this.options.warn, "sessions", { step: "live file", name }),
          );
          const parsed = text === null ? null : liveSessionFileSchema.safeParse(parseJson(text));
          return parsed?.success ? parsed.data : null;
        }),
    );
    const byPid = new Map(
      records.flatMap((record) => (record ? [[record.pid, { sessionId: record.sessionId, cwd: record.cwd }] as const] : [])),
    );
    if (byPid.size === 0) return new Map();
    const stdout = await this.listProcesses([...byPid.keys()]).catch(reportAnd("", this.options.warn, "sessions", { step: "ps" }));
    return panesFromPs(stdout, byPid);
  }

  private liveSessions(): Promise<Map<string, LiveSession>> {
    if (!this.live || this.now() - this.live.at > LIVE_TTL_MS) {
      this.live = {
        at: this.now(),
        value: this.scanLiveSessions().catch(reportAnd(new Map<string, LiveSession>(), this.options.warn, "sessions", { step: "live" })),
      };
    }
    return this.live.value;
  }

  private async liveSessionOf(paneKey: string): Promise<LocatedSession | null> {
    const live = (await this.liveSessions()).get(paneKey);
    if (!live) return null;
    const file = path.join(this.projectDirOf(live.cwd), `${live.sessionId}.jsonl`);
    const info = await this.statOrNull(file);
    if (!info) return null;
    const tail = await this.safeTail(file, info.size, info.mtimeMs);
    return { file, size: info.size, lastAssistant: tail?.lastAssistant ?? null };
  }

  private statOrNull(file: string) {
    return stat(file).catch(missingOr(null, this.options.warn, "sessions", { step: "stat", file }));
  }

  private safeTail(file: string, size: number, mtimeMs: number): Promise<TailEntry | null> {
    return this.tailOf(file, size, mtimeMs).catch(reportAnd(null, this.options.warn, "sessions", { step: "tail", file }));
  }

  private async tailOf(file: string, size: number, mtimeMs: number): Promise<TailEntry> {
    const cached = this.tails.get(file);
    if (cached && cached.mtimeMs === mtimeMs) return cached;
    const entry = { mtimeMs, ...locatorTail((await readTail(file, size, TAIL_BYTES)).split("\n")) };
    this.tails.set(file, entry);
    return entry;
  }

  private async match(cwd: string, preview: string | null, prompt: string | null): Promise<LocatedSession | null> {
    const replyNeedle = needleOf(preview);
    const promptNeedle = needleOf(prompt);
    if (!replyNeedle && !promptNeedle) return null;
    const dir = this.projectDirOf(cwd);
    const names = await readdir(dir).catch(missingOr<string[]>([], this.options.warn, "sessions", { step: "project dir", dir }));
    const files = await Promise.all(
      names
        .filter((name) => name.endsWith(".jsonl"))
        .map(async (name) => {
          const file = path.join(dir, name);
          const info = await this.statOrNull(file);
          return info ? { file, size: info.size, mtimeMs: info.mtimeMs } : null;
        }),
    );
    const candidates = files
      .filter((entry): entry is { file: string; size: number; mtimeMs: number } => entry !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, CANDIDATE_FILES);
    const tails = await Promise.all(
      candidates.map((candidate) => this.safeTail(candidate.file, candidate.size, candidate.mtimeMs)),
    );
    const pick = (index: number): LocatedSession | null => {
      const candidate = candidates[index];
      return candidate ? { file: candidate.file, size: candidate.size, lastAssistant: tails[index]?.lastAssistant ?? null } : null;
    };
    const byReply = replyNeedle
      ? tails.findIndex((tail) => tail?.lastAssistant && flatten(tail.lastAssistant).startsWith(replyNeedle))
      : -1;
    if (byReply >= 0) return pick(byReply);
    const byPrompt = promptNeedle ? tails.findIndex((tail) => tail?.recentUser.some((text) => text.includes(promptNeedle))) : -1;
    return byPrompt >= 0 ? pick(byPrompt) : null;
  }
}
