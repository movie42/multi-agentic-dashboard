import "server-only";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { UsageSnapshot } from "@/common/usage/types";
import { nodeExecFile, type ExecFileFn } from "../shared/ports";

// Same endpoint Claude Code's /usage screen reads; undocumented, so parse loosely.
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
// The endpoint rate-limits aggressive polling.
const CACHE_MS = 60_000;

const windowSchema = z
  .object({ utilization: z.number(), resets_at: z.string().nullable().optional() })
  .nullable()
  .optional();

const usageSchema = z.object({ five_hour: windowSchema, seven_day: windowSchema });

const credentialsSchema = z.object({
  claudeAiOauth: z.object({ accessToken: z.string(), expiresAt: z.number().optional() }),
});

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface UsageReaderDeps {
  execFile?: ExecFileFn;
  readCredentialsFile?: () => Promise<string>;
  fetch?: FetchFn;
  now?: () => number;
}

function toWindow(window: z.infer<typeof windowSchema>) {
  if (!window) return null;
  return { percent: Math.round(window.utilization), resetsAt: window.resets_at ?? null };
}

export class UsageReader {
  private cached: UsageSnapshot | null = null;
  private inflight: Promise<UsageSnapshot> | null = null;
  private readonly execFile: ExecFileFn;
  private readonly readCredentialsFile: () => Promise<string>;
  private readonly fetch: FetchFn;
  private readonly now: () => number;

  constructor(deps: UsageReaderDeps = {}) {
    this.execFile = deps.execFile ?? nodeExecFile;
    this.readCredentialsFile =
      deps.readCredentialsFile ?? (() => readFile(path.join(homedir(), ".claude", ".credentials.json"), "utf8"));
    this.fetch = deps.fetch ?? ((url, init) => fetch(url, init));
    this.now = deps.now ?? Date.now;
  }

  read(): Promise<UsageSnapshot> {
    if (this.cached && this.now() - this.cached.fetchedAt < CACHE_MS) return Promise.resolve(this.cached);
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<UsageSnapshot> {
    const token = await this.accessToken();
    const response = await this.fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) throw new Error("Claude Code 로그인 토큰이 만료됐어요. Claude Code를 한 번 실행하면 갱신돼요");
    if (!response.ok) throw new Error(`사용량 조회 실패 (HTTP ${response.status})`);
    const body = usageSchema.parse(await response.json());
    this.cached = { session: toWindow(body.five_hour), weekly: toWindow(body.seven_day), fetchedAt: this.now() };
    return this.cached;
  }

  private async accessToken(): Promise<string> {
    const raw = await this.readKeychain().catch(() => this.readCredentialsFile());
    return credentialsSchema.parse(JSON.parse(raw)).claudeAiOauth.accessToken;
  }

  private async readKeychain(): Promise<string> {
    if (process.platform !== "darwin") throw new Error("no keychain");
    const { stdout } = await this.execFile("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
      timeout: 5_000,
    });
    return stdout.trim();
  }
}
