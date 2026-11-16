import path from "node:path";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import type { SessionLink } from "../../src/common/orchestration/types.ts";
import { clip } from "./lastAnswer.ts";
import type { OrchestrationStore } from "./OrchestrationStore.ts";

export interface RuleRunnerDeps {
  store: OrchestrationStore;
  sessions: { get(id: string): RunnerSession | null; write(id: string, data: string): void };
  readAnswer: (transcriptPath: string) => Promise<string | null>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}

const SUBMIT_DELAY_MS = 300;
/** How long a delivered message holds the target before another may follow, if no hook says it started. */
const INFLIGHT_MS = 15_000;

export function pasteOf(text: string): string {
  return /[\r\n]/.test(text) ? `\x1b[200~${text}\x1b[201~` : text;
}

function nameOf(session: RunnerSession | null, id: string): string {
  return session ? `${path.basename(session.cwd)} · ${id.slice(0, 8)}` : id.slice(0, 8);
}

/**
 * Carries out the lines between sessions. When a session stops, its last answer goes to every
 * session it reports to, and every session it chains to is told to continue. Text for a busy
 * session waits in a queue and is typed in once that session is idle again.
 */
export class RuleRunner {
  #transcripts = new Map<string, string>();
  #queues = new Map<string, string[]>();
  #inflight = new Map<string, number>();
  #deps: Required<Omit<RuleRunnerDeps, "wait" | "now">> & { wait: (ms: number) => Promise<void>; now: () => number };

  constructor(deps: RuleRunnerDeps) {
    this.#deps = { wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: Date.now, ...deps };
  }

  /** Every hook payload passes through here; a Stop runs the session's outgoing lines. */
  async noteHook(sessionId: string, event: string, body: unknown): Promise<void> {
    const transcript = field(body, "transcript_path");
    if (typeof transcript === "string" && transcript) this.#transcripts.set(sessionId, transcript);
    if (event === "UserPromptSubmit") this.#inflight.delete(sessionId);
    if (event !== "Stop") return;
    this.#inflight.delete(sessionId);
    const last = field(body, "last_assistant_message");
    await this.onStop(sessionId, typeof last === "string" && last.trim() ? last : null);
    this.flush(sessionId);
  }

  async readResult(sessionId: string): Promise<string | null> {
    const transcript = this.#transcripts.get(sessionId);
    if (!transcript) return null;
    try {
      return await this.#deps.readAnswer(transcript);
    } catch (error) {
      console.error("[orchestration] transcript unreadable", sessionId, error);
      return null;
    }
  }

  async onStop(sessionId: string, lastMessage: string | null): Promise<void> {
    const outgoing = this.#deps.store.linksFrom(sessionId).filter((link) => link.kind !== "delegate" && !link.paused);
    if (outgoing.length === 0) return;
    const answer = lastMessage ?? (await this.readResult(sessionId)) ?? "(마지막 답을 읽지 못했어요)";
    const from = nameOf(this.#deps.sessions.get(sessionId), sessionId);
    for (const link of outgoing) {
      if (!this.#deps.store.countTrip(link.id)) {
        console.log("[orchestration] link paused after repeated trips", link.id);
        continue;
      }
      this.deliver(link.to, messageFor(link, from, clip(answer)));
    }
  }

  deliver(sessionId: string, text: string): void {
    this.#queues.set(sessionId, [...(this.#queues.get(sessionId) ?? []), text]);
    this.flush(sessionId);
  }

  /** Called whenever session statuses change, so queued text reaches sessions that just went idle. */
  sessionsChanged(sessions: RunnerSession[]): void {
    for (const session of sessions) {
      if (session.status === "working") this.#inflight.delete(session.id);
      if (this.#queues.has(session.id)) this.flush(session.id);
    }
  }

  pending(sessionId: string): number {
    return this.#queues.get(sessionId)?.length ?? 0;
  }

  flush(sessionId: string): void {
    const queue = this.#queues.get(sessionId);
    if (!queue || queue.length === 0) return;
    const session = this.#deps.sessions.get(sessionId);
    if (!session || session.status === "exited") {
      this.#queues.delete(sessionId);
      return;
    }
    const since = this.#inflight.get(sessionId);
    if (since !== undefined && this.#deps.now() - since < INFLIGHT_MS) return;
    if (session.status !== "idle") return;
    const [text, ...rest] = queue;
    if (rest.length > 0) this.#queues.set(sessionId, rest);
    else this.#queues.delete(sessionId);
    if (text === undefined) return;
    this.#inflight.set(sessionId, this.#deps.now());
    this.#deps.sessions.write(sessionId, pasteOf(text));
    void this.#deps.wait(SUBMIT_DELAY_MS).then(() => this.#deps.sessions.write(sessionId, "\r"));
  }
}

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null ? Reflect.get(body, key) : undefined;
}

export function messageFor(link: SessionLink, from: string, answer: string): string {
  if (link.kind === "next") {
    return `[Agent Control] 앞 세션(${from})이 끝났어요. 이어서 진행해 주세요.\n\n앞 세션의 마지막 답:\n${answer}`;
  }
  return `[Agent Control] 세션 ${from}의 보고:\n${answer}`;
}
