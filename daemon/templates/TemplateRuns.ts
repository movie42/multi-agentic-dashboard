import { MAX_TRIPS } from "../../src/common/orchestration/types.ts";
import type { RunnerLaunchRequest, RunnerSession } from "../../src/common/runner/types.ts";
import { routesFrom, type RunHold, type TemplateCard, type TemplateRoute, type TemplateRun, type WorkflowTemplate } from "../../src/common/templates/types.ts";

export const RUNS_FILE = "runs.json";

export interface TemplateRunsDeps {
  get: (id: string) => RunnerSession | null;
  launch: (request: RunnerLaunchRequest) => RunnerSession;
  deliver: (id: string, text: string) => boolean;
  lastAnswer: (id: string) => string | null;
  check: (cwd: string, command: string) => Promise<boolean>;
  onChange: () => void;
  now?: () => number;
  newId?: () => string;
}

interface Arrival {
  card: TemplateCard;
  answer: string | null;
  route: TemplateRoute | null;
  reason: string | null;
}

type Result = { ok: true; run: TemplateRun } | { ok: false; error: string };

const ACTIVE: ReadonlySet<TemplateRun["state"]> = new Set(["expanded", "running", "paused"]);

export function cardText(run: TemplateRun, card: TemplateCard, from: Arrival | null, revisit: boolean): string {
  const intent = run.intent.trim() ? `이번 작업: ${run.intent.trim()}` : "";
  const head = revisit
    ? `[Agent Control] 템플릿 '${run.name}'의 흐름이 '${card.title}' 카드로 돌아왔어요. 아래 내용을 반영해 이어서 해 주세요.`
    : `[Agent Control] 템플릿 '${run.name}' · '${card.title}' 카드예요.`;
  const body = revisit ? "" : card.prompt.trim();
  const picked = from?.route?.label ? `'${from.card.title}' 카드가 '${from.route.label}' 길을 골랐어요.${from.reason?.trim() ? ` 이유: ${from.reason.trim()}` : ""}` : "";
  const answer = from?.answer?.trim() ? `앞 카드 '${from.card.title}'의 마지막 답:\n${from.answer.trim()}` : "";
  const routes = card.kind === "judge" ? judgeText(run, card) : "";
  return [head, intent, body, picked, answer, routes].filter(Boolean).join("\n\n");
}

function judgeText(run: TemplateRun, card: TemplateCard): string {
  const lines = routesFrom(run.routes, card.key).map((route) => {
    const to = run.cards.find((item) => item.key === route.to)?.title ?? route.to;
    return `- ${route.label ?? to} → ${to}`;
  });
  return [`판단이 끝나면 agent-control의 choose_route 도구로 다음 길 하나를 고르고 턴을 마쳐 주세요.`, ...lines].join("\n");
}

export class TemplateRuns {
  #runs = new Map<string, TemplateRun>();
  #deps: Required<TemplateRunsDeps>;

  constructor(deps: TemplateRunsDeps) {
    this.#deps = { now: Date.now, newId: () => crypto.randomUUID(), ...deps };
  }

  load(runs: TemplateRun[]): void {
    this.#runs = new Map(runs.map((run) => [run.id, run]));
  }

  list(): TemplateRun[] {
    return [...this.#runs.values()];
  }

  snapshot(sessions: RunnerSession[]): TemplateRun[] {
    const keyOf = new Map(sessions.map((session) => [session.id, session.conversationId ?? session.id]));
    return this.list().map((run) => ({ ...run, sessions: Object.fromEntries(Object.entries(run.sessions).map(([card, id]) => [card, keyOf.get(id) ?? id])) }));
  }

  expand(template: WorkflowTemplate, cwd: string, intent: string): Result {
    const active = this.list().find((run) => run.cwd === cwd && ACTIVE.has(run.state));
    if (active) return { ok: false, error: `이 워크트리에는 이미 펼친 템플릿 '${active.name}'이 있어요.` };
    const run: TemplateRun = {
      id: this.#deps.newId(),
      templateId: template.id,
      name: template.name,
      cwd,
      intent: intent.trim(),
      cards: template.cards,
      routes: template.routes,
      state: "expanded",
      current: null,
      sessions: {},
      choice: null,
      trips: {},
      hold: null,
      createdAt: this.#deps.now(),
    };
    this.#put(run);
    return { ok: true, run };
  }

  start(runId: string): Result {
    const run = this.#runs.get(runId);
    const first = run?.cards[0];
    if (!run || !first) return { ok: false, error: "펼친 템플릿이 없어요." };
    if (run.state !== "expanded") return { ok: false, error: "이미 시작한 템플릿이에요." };
    return { ok: true, run: this.#enter(run, first, null) };
  }

  continue(runId: string, routeId: string | null = null): Result {
    const run = this.#runs.get(runId);
    if (!run || !run.current || (run.state !== "paused" && run.state !== "running")) return { ok: false, error: "이어서 갈 카드가 없어요." };
    const session = run.sessions[run.current];
    const answer = session ? this.#deps.lastAnswer(session) : null;
    const reset = run.hold?.reason === "trips" ? { ...run, trips: {} } : run;
    return this.#advance({ ...reset, hold: null }, answer, routeId, true);
  }

  retry(runId: string, text: string): Result {
    const run = this.#runs.get(runId);
    const session = run?.current ? run.sessions[run.current] : undefined;
    if (!run || !session || !text.trim() || (run.state !== "paused" && run.state !== "running")) return { ok: false, error: "다시 보낼 카드 세션이 없어요." };
    if (!this.#deps.deliver(session, `[Agent Control] ${text.trim()}`)) return { ok: false, error: "카드 세션이 닫혔어요." };
    const trips = run.hold?.reason === "trips" ? {} : run.trips;
    return { ok: true, run: this.#put({ ...run, state: "running", hold: null, choice: null, trips }) };
  }

  stop(runId: string): Result {
    const run = this.#runs.get(runId);
    if (!run) return { ok: false, error: "펼친 템플릿이 없어요." };
    return { ok: true, run: this.#put({ ...run, state: "stopped", hold: null }) };
  }

  remove(runId: string): boolean {
    if (!this.#runs.delete(runId)) return false;
    this.#deps.onChange();
    return true;
  }

  isJudge(sessionId: string): boolean {
    return this.list().some((run) => run.cards.some((card) => card.kind === "judge" && run.sessions[card.key] === sessionId));
  }

  launchOptionsOf(sessionId: string): Pick<RunnerLaunchRequest, "model" | "effort" | "judge"> {
    for (const run of this.#runs.values()) {
      const owners = run.cards.filter((card) => run.sessions[card.key] === sessionId);
      const opener = owners.find((card) => !card.continueFrom) ?? owners[0];
      if (!opener) continue;
      return {
        ...(opener.model ? { model: opener.model } : {}),
        ...(opener.effort ? { effort: opener.effort } : {}),
        ...(owners.some((card) => card.kind === "judge") ? { judge: true } : {}),
      };
    }
    return {};
  }

  judgeRoutes(sessionId: string): TemplateRoute[] {
    const found = this.#currentOf(sessionId);
    return found && found.card.kind === "judge" ? routesFrom(found.run.routes, found.card.key) : [];
  }

  choose(sessionId: string, label: string, reason: string): Result {
    const found = this.#currentOf(sessionId);
    if (!found || found.card.kind !== "judge") return { ok: false, error: "지금 길을 고를 판단 카드가 아니에요." };
    const route = routesFrom(found.run.routes, found.card.key).find((item) => (item.label ?? item.to) === label.trim());
    if (!route) return { ok: false, error: `'${label}'라는 길이 없어요.` };
    return { ok: true, run: this.#put({ ...found.run, choice: { routeId: route.id, reason: reason.trim() } }) };
  }

  async onStop(sessionId: string, answer: string | null): Promise<void> {
    const found = this.#currentOf(sessionId);
    if (!found) return;
    const { run, card } = found;
    if (card.kind === "judge" && !run.choice) {
      this.#hold(run, { reason: "no-choice", text: "판단 카드가 길을 고르지 않고 턴을 마쳤어요. 길을 골라 주세요." });
      return;
    }
    if (card.check) {
      const passed = await this.#deps.check(run.cwd, card.check).catch((error: unknown) => {
        console.warn("[templates] check failed to run", card.check, error);
        return false;
      });
      const latest = this.#runs.get(run.id);
      if (!latest || latest.state !== "running" || latest.current !== card.key) return;
      if (!passed) {
        this.#put({ ...latest, hold: { reason: "check-failed", text: `확인 명령이 통과하지 않아 이 카드에 머물러요: ${card.check}` } });
        return;
      }
      this.#finish(latest, card, answer);
      return;
    }
    this.#finish(run, card, answer);
  }

  prune(liveIds: ReadonlySet<string>): void {
    this.list()
      .filter((run) => run.state === "running" && run.current && run.sessions[run.current] && !liveIds.has(run.sessions[run.current]!))
      .forEach((run) => this.#hold(run, { reason: "exited", text: "카드 세션이 닫혔어요. 계속하면 다음 카드로, 고쳐서 다시는 쓸 수 없어요." }));
  }

  #finish(run: TemplateRun, card: TemplateCard, answer: string | null): void {
    if (card.pauseAfter) {
      this.#hold(run, { reason: "pause-after", text: `'${card.title}' 카드가 끝났어요. 확인한 뒤 계속하거나 고쳐서 다시 보내 주세요.` });
      return;
    }
    this.#advance(run, answer, null, false);
  }

  #advance(run: TemplateRun, answer: string | null, routeId: string | null, force: boolean): Result {
    const card = run.cards.find((item) => item.key === run.current);
    if (!card) return { ok: false, error: "지금 카드가 없어요." };
    const routes = routesFrom(run.routes, card.key);
    const chosen = routeId ?? (card.kind === "judge" ? (run.choice?.routeId ?? null) : (routes[0]?.id ?? null));
    const route = routes.find((item) => item.id === chosen) ?? null;
    if (!route) {
      if (routes.length > 0) return { ok: true, run: this.#hold(run, { reason: "no-choice", text: "갈 길을 골라 주세요." }) };
      return { ok: true, run: this.#put({ ...run, state: "done", current: null, hold: null, choice: null }) };
    }
    const target = run.cards.find((item) => item.key === route.to);
    if (!target) return { ok: false, error: "길 끝의 카드가 없어요." };
    const revisit = this.#liveSession(run.sessions[target.key]) !== null;
    const trips = revisit ? (run.trips[route.id] ?? 0) + 1 : (run.trips[route.id] ?? 0);
    if (revisit && !force && trips >= MAX_TRIPS) {
      return { ok: true, run: this.#hold({ ...run, trips: { ...run.trips, [route.id]: trips } }, { reason: "trips", text: `'${card.title}' → '${target.title}' 길을 ${trips}번 되돌았어요. 확인한 뒤 계속해 주세요.` }) };
    }
    const arrival: Arrival = { card, answer, route, reason: run.choice?.routeId === route.id ? run.choice.reason : null };
    return { ok: true, run: this.#enter({ ...run, trips: { ...run.trips, [route.id]: trips } }, target, arrival) };
  }

  #enter(run: TemplateRun, card: TemplateCard, from: Arrival | null): TemplateRun {
    const own = this.#liveSession(run.sessions[card.key]);
    const previous = from && card.continueFrom && from.card.kind === "work" ? this.#liveSession(run.sessions[from.card.key]) : null;
    const text = cardText(run, card, from, own !== null);
    const target = own ?? previous;
    if (target) this.#deps.deliver(target, text);
    const sessionId =
      target ??
      this.#deps.launch({
        cwd: run.cwd,
        prompt: text,
        ...(card.model ? { model: card.model } : {}),
        ...(card.effort ? { effort: card.effort } : {}),
        ...(card.kind === "judge" ? { judge: true } : {}),
      }).id;
    return this.#put({ ...run, state: "running", current: card.key, sessions: { ...run.sessions, [card.key]: sessionId }, choice: null, hold: null });
  }

  #liveSession(id: string | undefined): string | null {
    const session = id ? this.#deps.get(id) : null;
    return session && session.status !== "exited" ? session.id : null;
  }

  #currentOf(sessionId: string): { run: TemplateRun; card: TemplateCard } | null {
    for (const run of this.#runs.values()) {
      if (run.state !== "running" || !run.current || run.sessions[run.current] !== sessionId) continue;
      const card = run.cards.find((item) => item.key === run.current);
      if (card) return { run, card };
    }
    return null;
  }

  #hold(run: TemplateRun, hold: RunHold): TemplateRun {
    return this.#put({ ...run, state: "paused", hold });
  }

  #put(run: TemplateRun): TemplateRun {
    this.#runs.set(run.id, run);
    this.#deps.onChange();
    return run;
  }
}
