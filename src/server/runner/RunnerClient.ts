import "server-only";
import { runnerResponseSchema } from "@/common/runner/schema";
import type { RunnerInputRequest, RunnerLaunchRequest, RunnerPermissionAnswer, RunnerSession } from "@/common/runner/types";

export interface RunnerClientOptions {
  baseUrl: string;
  fetch: typeof fetch;
  start: () => void;
  wait?: (ms: number) => Promise<void>;
  attempts?: number;
  now?: () => number;
}

const POLL_MS = 100;
const DEFAULT_ATTEMPTS = 150;
const FAILED_BOOT_COOLDOWN_MS = 10_000;
const JSON_HEADERS = { "Content-Type": "application/json" };

class RunnerOffline extends Error {}

type RunnerResponse = ReturnType<typeof runnerResponseSchema.parse>;

export class RunnerClient {
  private starting: Promise<void> | null = null;
  private failedBootAt: number | null = null;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(private readonly options: RunnerClientOptions) {
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async list(): Promise<RunnerSession[]> {
    return (await this.call("/sessions")).sessions ?? [];
  }

  async launch(request: RunnerLaunchRequest): Promise<RunnerSession> {
    const { session } = await this.call("/sessions", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) });
    if (!session) throw new Error("세션 러너 응답에 세션이 없어요.");
    return session;
  }

  async input(id: string, request: RunnerInputRequest): Promise<void> {
    await this.call(`/sessions/${encodeURIComponent(id)}/input`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    });
  }

  async answerPermission(id: string, requestId: string, answer: RunnerPermissionAnswer): Promise<void> {
    await this.call(`/sessions/${encodeURIComponent(id)}/permission`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ requestId, answer }),
    });
  }

  async screen(id: string): Promise<string[]> {
    return (await this.call(`/sessions/${encodeURIComponent(id)}/screen`)).lines ?? [];
  }

  async close(id: string): Promise<void> {
    await this.call(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  ensureRunning(): Promise<void> {
    const now = (this.options.now ?? Date.now)();
    if (!this.starting && this.failedBootAt !== null && now - this.failedBootAt < FAILED_BOOT_COOLDOWN_MS) {
      return Promise.reject(new Error("세션 러너 데몬을 띄우지 못했어요."));
    }
    this.starting ??= this.boot().then(
      () => {
        this.failedBootAt = null;
        this.starting = null;
      },
      (error: unknown) => {
        this.failedBootAt = (this.options.now ?? Date.now)();
        this.starting = null;
        throw error;
      },
    );
    return this.starting;
  }

  private async boot(): Promise<void> {
    if (await this.reachable()) return;
    console.log("[runner] daemon is not running — starting it");
    this.options.start();
    const poll = async (left: number): Promise<void> => {
      if (left <= 0) throw new Error("세션 러너 데몬을 띄우지 못했어요.");
      await this.wait(POLL_MS);
      if (!(await this.reachable())) await poll(left - 1);
    };
    await poll(this.options.attempts ?? DEFAULT_ATTEMPTS);
  }

  private reachable(): Promise<boolean> {
    return this.request("/sessions").then(
      () => true,
      (error: unknown) => {
        if (error instanceof RunnerOffline) return false;
        throw error;
      },
    );
  }

  private async call(path: string, init?: RequestInit): Promise<RunnerResponse> {
    try {
      return await this.request(path, init);
    } catch (error) {
      if (!(error instanceof RunnerOffline)) throw error;
      await this.ensureRunning();
      return this.request(path, init);
    }
  }

  private async request(path: string, init?: RequestInit): Promise<RunnerResponse> {
    const response = await this.options.fetch(`${this.options.baseUrl}${path}`, { cache: "no-store", ...init }).catch(() => {
      throw new RunnerOffline("세션 러너 데몬에 연결하지 못했어요.");
    });
    const body = runnerResponseSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok) throw new Error(body.data?.error ?? `세션 러너가 ${response.status}로 응답했어요.`);
    if (!body.success) throw new Error("세션 러너 응답을 읽지 못했어요.");
    return body.data;
  }
}
