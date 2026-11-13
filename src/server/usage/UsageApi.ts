import "server-only";
import { readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { UsageWindow } from "@/common/usage/types";
import { nodeExecFile, type ExecFileFn } from "../shared/ports";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const SUCCESS_CACHE_MS = 10 * 60_000;
const FIRST_BACKOFF_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

const windowSchema = z
  .object({ utilization: z.number(), resets_at: z.string().nullable().optional() })
  .nullable()
  .optional();

const usageSchema = z.object({ five_hour: windowSchema, seven_day: windowSchema });

const credentialsSchema = z.object({
  claudeAiOauth: z.object({ accessToken: z.string() }),
});

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface UsageApiDeps {
  execFile?: ExecFileFn;
  readCredentialsFile?: () => Promise<string>;
  keychainAccount?: string;
  fetch?: FetchFn;
  now?: () => number;
}

export interface ApiUsage {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  receivedAt: number;
}

function toWindow(window: z.infer<typeof windowSchema>): UsageWindow | null {
  if (!window) return null;
  return { percent: Math.round(window.utilization), resetsAt: window.resets_at ?? null };
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 0;
}

class UsageApiError extends Error {
  constructor(
    message: string,
    readonly retryAfter = 0,
  ) {
    super(message);
  }
}

export class UsageApi {
  private cached: ApiUsage | null = null;
  private inflight: Promise<ApiUsage> | null = null;
  private failure: { error: Error; retryAt: number; count: number } | null = null;
  private readonly execFile: ExecFileFn;
  private readonly readCredentialsFile: () => Promise<string>;
  private readonly keychainAccount: string;
  private readonly fetch: FetchFn;
  private readonly now: () => number;

  constructor(deps: UsageApiDeps = {}) {
    this.execFile = deps.execFile ?? nodeExecFile;
    this.readCredentialsFile =
      deps.readCredentialsFile ?? (() => readFile(path.join(homedir(), ".claude", ".credentials.json"), "utf8"));
    this.keychainAccount = deps.keychainAccount ?? process.env.USER ?? userInfo().username;
    this.fetch = deps.fetch ?? ((url, init) => fetch(url, init));
    this.now = deps.now ?? Date.now;
  }

  read(): Promise<ApiUsage> {
    if (process.env.AGENT_CONTROL_USAGE_API === "off") return Promise.reject(new Error("사용량 API 조회가 꺼져 있어요"));
    const now = this.now();
    if (this.cached && now - this.cached.receivedAt < SUCCESS_CACHE_MS) return Promise.resolve(this.cached);
    if (this.failure && now < this.failure.retryAt) return Promise.reject(this.waitingError(now));
    this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private waitingError(now: number): Error {
    const { error, retryAt } = this.failure!;
    const minutes = Math.max(1, Math.ceil((retryAt - now) / 60_000));
    return new Error(`${error.message} · ${minutes}분 뒤 다시 시도해요`);
  }

  private async load(): Promise<ApiUsage> {
    try {
      const usage = await this.request();
      this.cached = usage;
      this.failure = null;
      return usage;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      const count = (this.failure?.count ?? 0) + 1;
      const backoff = Math.min(MAX_BACKOFF_MS, FIRST_BACKOFF_MS * 2 ** (count - 1));
      const retryAfter = failure instanceof UsageApiError ? failure.retryAfter : 0;
      this.failure = { error: failure, retryAt: this.now() + Math.max(backoff, retryAfter), count };
      throw failure;
    }
  }

  private async request(): Promise<ApiUsage> {
    const token = await this.accessToken();
    const response = await this.fetch(USAGE_URL, {
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) {
      throw new UsageApiError("Claude Code 로그인 토큰이 만료됐어요. Claude Code를 한 번 실행하면 갱신돼요");
    }
    if (!response.ok) throw new UsageApiError(`사용량 조회 실패 (HTTP ${response.status})`, retryAfterMs(response));
    const body = usageSchema.parse(await response.json());
    return { session: toWindow(body.five_hour), weekly: toWindow(body.seven_day), receivedAt: this.now() };
  }

  private async accessToken(): Promise<string> {
    const raw = await this.readKeychain().catch(() => this.readCredentialsFile());
    return credentialsSchema.parse(JSON.parse(raw)).claudeAiOauth.accessToken;
  }

  private async readKeychain(): Promise<string> {
    if (process.platform !== "darwin") throw new Error("no keychain");
    return this.findKeychainItem(["-a", this.keychainAccount]).catch(() => this.findKeychainItem([]));
  }

  private async findKeychainItem(accountArgs: string[]): Promise<string> {
    const { stdout } = await this.execFile(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", ...accountArgs, "-w"],
      { timeout: 5_000 },
    );
    return stdout.trim();
  }
}
