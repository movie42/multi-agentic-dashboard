import {
  CONDUCTOR_SCOPE_KINDS,
  GRANT_BUNDLES,
  LINK_KINDS,
  MAX_TRIPS,
  type Conductor,
  type ConductorLaunch,
  type DelegatedRule,
  type LinkKind,
  type OrchestrationLink,
  type ProjectRequest,
  type WorktreeRequest,
} from "../../src/common/orchestration/types.ts";
import type { RunnerSession } from "../../src/common/runner/types.ts";

export const ORCHESTRATION_FILE = "orchestration.json";

/** A daemon-written prompt that has not shown up as UserPromptSubmit yet; stale ones stop blocking the queue. */
const INFLIGHT_MS = 15_000;

export interface OrchestrationDeps {
  get: (id: string) => RunnerSession | null;
  /** Pastes `text` into the session's terminal and presses Enter. */
  send: (id: string, text: string) => void;
  onChange: () => void;
  /** Every worktree folder of a project right now; a plain folder project is just itself. */
  worktreesOf?: (project: string) => Promise<string[]>;
  /** Address a session can curl to read another session's terminal output as plain text. */
  logUrl?: (id: string) => string;
  now?: () => number;
  newId?: () => string;
}

export interface SavedOrchestration {
  conductors: Record<string, Conductor>;
  links: OrchestrationLink[];
}

interface Pending {
  text: string;
  link: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function conductorOf(value: unknown): Conductor | null {
  const raw = record(value);
  const scope = record(raw?.scope);
  if (!raw || !scope) return null;
  const kind = CONDUCTOR_SCOPE_KINDS.find((item) => item === scope.kind);
  if (!kind || typeof scope.root !== "string") return null;
  // Saved before scopes were kept per project: a project conductor covered its own project.
  const projects = Array.isArray(scope.projects) ? strings(scope.projects) : kind === "project" ? [scope.root] : [];
  const grants = strings(raw.grants).flatMap((grant) => GRANT_BUNDLES.filter((bundle) => bundle === grant));
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).flatMap((item: unknown): DelegatedRule[] => {
    const rule = record(item);
    if (!rule || typeof rule.toolName !== "string") return [];
    return [{ toolName: rule.toolName, prefix: typeof rule.prefix === "string" ? rule.prefix : null }];
  });
  return {
    scope: { kind, root: scope.root, paths: strings(scope.paths), projects },
    grants,
    rules,
    knownProjects: strings(raw.knownProjects),
    worktreeRequest: null,
    projectRequest: null,
  };
}

function linkOf(value: unknown): OrchestrationLink | null {
  const raw = record(value);
  if (!raw) return null;
  const kind = LINK_KINDS.find((item) => item === raw.kind);
  const { id, from, to, prompt, trips, paused, createdAt } = raw;
  if (!kind || typeof id !== "string" || typeof from !== "string" || typeof to !== "string") return null;
  return {
    id,
    kind,
    from,
    to,
    prompt: typeof prompt === "string" ? prompt : null,
    trips: typeof trips === "number" ? trips : 0,
    paused: paused === true,
    createdAt: typeof createdAt === "number" ? createdAt : 0,
  };
}

export function parseSavedOrchestration(body: unknown): SavedOrchestration {
  const raw = record(body);
  const conductors = Object.fromEntries(
    Object.entries(record(raw?.conductors) ?? {}).flatMap(([id, value]) => {
      const conductor = conductorOf(value);
      return conductor ? [[id, conductor]] : [];
    }),
  );
  const links = (Array.isArray(raw?.links) ? raw.links : []).flatMap((item: unknown) => {
    const link = linkOf(item);
    return link ? [link] : [];
  });
  return { conductors, links };
}

export function isWithin(cwd: string, folder: string): boolean {
  return cwd === folder || cwd.startsWith(`${folder.replace(/\/+$/, "")}/`);
}

export function reportText(from: RunnerSession, answer: string | null): string {
  const body = answer?.trim() || "(마지막 답을 읽지 못했어요. read_result 도구로 다시 확인해 주세요.)";
  return `[Agent Control] 세션 ${from.id} (${from.cwd})이 할 일을 마치고 보고했어요.\n\n${body}`;
}

export function delegateText(from: RunnerSession, prompt: string): string {
  return `[Agent Control] 세션 ${from.id} (${from.cwd})이 이 일을 맡겼어요. 마치면 마지막 답이 그 세션에 보고돼요.\n\n${prompt.trim()}`;
}

export function revisedText(from: RunnerSession, prompt: string): string {
  return `[Agent Control] 세션 ${from.id} (${from.cwd})이 맡긴 일을 고쳤어요. 앞서 받은 내용 대신 아래 내용으로 이어서 해 주세요.\n\n${prompt.trim()}`;
}

export function watchText(from: RunnerSession, logUrl: string): string {
  return [
    `[Agent Control] 터미널 세션 ${from.id} (${from.cwd})을 이 세션에 연결했어요.`,
    "사람이 에러나 로그, 터미널 출력을 말하면 붙여 넣기를 기다리지 말고 아래 명령으로 최근 출력을 직접 읽어 보세요. lines 값으로 줄 수를 정해요.",
    `curl -s '${logUrl}?lines=200'`,
    "지금은 이 안내를 받았다고 한 줄로만 답해 주세요.",
  ].join("\n");
}

export function nextText(from: RunnerSession, prompt: string | null, answer: string | null): string {
  const lead = prompt?.trim() || "앞 세션이 끝났어요. 이어서 맡은 일을 시작해 주세요.";
  const result = answer?.trim() ? `\n\n앞 세션(${from.id})의 마지막 답:\n${answer.trim()}` : "";
  return `[Agent Control] ${lead}${result}`;
}

export class Orchestration {
  #conductors = new Map<string, Conductor>();
  #links: OrchestrationLink[] = [];
  #answers = new Map<string, string>();
  #queues = new Map<string, Pending[]>();
  #fedBy = new Map<string, string>();
  #inflight = new Map<string, number>();
  #deps: Required<OrchestrationDeps>;

  constructor(deps: OrchestrationDeps) {
    this.#deps = {
      now: Date.now,
      newId: () => crypto.randomUUID(),
      worktreesOf: async (project) => [project],
      logUrl: (id) => `http://127.0.0.1/sessions/${id}/log`,
      ...deps,
    };
  }

  load(saved: SavedOrchestration): void {
    this.#conductors = new Map(Object.entries(saved.conductors));
    this.#links = [...saved.links];
  }

  /** Persisted under the id a restart resumes with — the conversation the terminal ended on. */
  snapshot(sessions: RunnerSession[]): SavedOrchestration {
    const keyOf = new Map(sessions.map((session) => [session.id, session.conversationId ?? session.id]));
    const key = (id: string) => keyOf.get(id) ?? id;
    return {
      conductors: Object.fromEntries([...this.#conductors].map(([id, conductor]) => [key(id), { ...conductor, worktreeRequest: null, projectRequest: null }])),
      links: this.#links.map((link) => ({ ...link, from: key(link.from), to: key(link.to) })),
    };
  }

  /** Drops what points at sessions that no longer exist. */
  prune(liveIds: ReadonlySet<string>): void {
    const conductors = [...this.#conductors.keys()].filter((id) => !liveIds.has(id));
    const links = this.#links.filter((link) => !liveIds.has(link.from) || !liveIds.has(link.to));
    if (conductors.length === 0 && links.length === 0) return;
    conductors.forEach((id) => this.#conductors.delete(id));
    this.#links = this.#links.filter((link) => !links.includes(link));
    [this.#answers, this.#queues, this.#fedBy, this.#inflight].forEach((map) => {
      [...map.keys()].filter((id) => !liveIds.has(id)).forEach((id) => map.delete(id));
    });
    this.#deps.onChange();
  }

  decorate(sessions: RunnerSession[]): RunnerSession[] {
    return sessions.map((session) => ({
      ...session,
      orchestration: {
        conductor: this.#conductors.get(session.id) ?? null,
        parentId: this.parentOf(session.id),
        links: this.#links.filter((link) => link.from === session.id),
      },
    }));
  }

  conductor(id: string): Conductor | null {
    return this.#conductors.get(id) ?? null;
  }

  isConductor(id: string): boolean {
    return this.#conductors.has(id);
  }

  parentOf(id: string): string | null {
    return this.#links.find((link) => link.kind === "delegate" && link.to === id)?.from ?? null;
  }

  links(): OrchestrationLink[] {
    return [...this.#links];
  }

  lastAnswer(id: string): string | null {
    return this.#answers.get(id) ?? null;
  }

  addConductor(id: string, launch: ConductorLaunch): Conductor {
    const conductor: Conductor = {
      scope: launch.scope,
      grants: [...launch.grants],
      rules: [],
      knownProjects: [...launch.knownProjects],
      worktreeRequest: null,
      projectRequest: null,
    };
    this.#conductors.set(id, conductor);
    this.#deps.onChange();
    return conductor;
  }

  addRule(conductorId: string, rule: DelegatedRule): boolean {
    const conductor = this.#conductors.get(conductorId);
    if (!conductor) return false;
    if (conductor.rules.some((item) => item.toolName === rule.toolName && item.prefix === rule.prefix)) return true;
    this.#conductors.set(conductorId, { ...conductor, rules: [...conductor.rules, rule] });
    this.#deps.onChange();
    return true;
  }

  addScopePath(conductorId: string, folder: string): boolean {
    const conductor = this.#conductors.get(conductorId);
    if (!conductor) return false;
    const paths = conductor.scope.paths.includes(folder) ? conductor.scope.paths : [...conductor.scope.paths, folder];
    this.#conductors.set(conductorId, { ...conductor, scope: { ...conductor.scope, paths } });
    this.#deps.onChange();
    return true;
  }

  /** Worktree folders the conductor may open sessions in right now, its projects' current worktrees included. */
  async scopeFolders(conductorId: string): Promise<string[]> {
    const conductor = this.#conductors.get(conductorId);
    if (!conductor) return [];
    const projects = await this.scopeProjects(conductorId);
    return [...new Set([...conductor.scope.paths, ...projects.flatMap((entry) => [entry.path, ...entry.worktrees])])];
  }

  /** Each project in scope with its worktree folders as git lists them now. */
  async scopeProjects(conductorId: string): Promise<{ path: string; worktrees: string[] }[]> {
    const conductor = this.#conductors.get(conductorId);
    if (!conductor) return [];
    return Promise.all(
      conductor.scope.projects.map(async (project) => ({ path: project, worktrees: await this.#deps.worktreesOf(project).catch(() => [project]) })),
    );
  }

  async inScope(conductorId: string, cwd: string): Promise<boolean> {
    return (await this.scopeFolders(conductorId)).some((folder) => isWithin(cwd, folder));
  }

  requestProject(conductorId: string, request: Omit<ProjectRequest, "id" | "requestedAt">): ProjectRequest | null {
    const conductor = this.#conductors.get(conductorId);
    if (!conductor) return null;
    const projectRequest = { ...request, id: this.#deps.newId(), requestedAt: this.#deps.now() };
    this.#conductors.set(conductorId, { ...conductor, projectRequest });
    this.#deps.onChange();
    return projectRequest;
  }

  /** Settles the pending project request; `path` is the project folder the person allowed, null when declined. */
  settleProject(conductorId: string, requestId: string, path: string | null, error?: string): ProjectRequest | null {
    const conductor = this.#conductors.get(conductorId);
    const request = conductor?.projectRequest;
    if (!conductor || !request || request.id !== requestId) return null;
    const projects = path && !conductor.scope.projects.includes(path) ? [...conductor.scope.projects, path] : conductor.scope.projects;
    this.#conductors.set(conductorId, { ...conductor, scope: { ...conductor.scope, projects }, projectRequest: null });
    this.#deps.onChange();
    const text = path
      ? `[Agent Control] 프로젝트 ${path}를 맡겨 줬어요. list_worktrees로 워크트리를 보고 start_session으로 세션을 열 수 있어요.`
      : `[Agent Control] 프로젝트 ${request.path}는 맡기지 않았어요.${error ? ` (${error})` : " 사람이 거절했어요."}`;
    this.deliver(conductorId, text, null);
    return request;
  }

  requestWorktree(conductorId: string, request: Omit<WorktreeRequest, "id" | "requestedAt">): WorktreeRequest | null {
    const conductor = this.#conductors.get(conductorId);
    if (!conductor) return null;
    const worktreeRequest = { ...request, id: this.#deps.newId(), requestedAt: this.#deps.now() };
    this.#conductors.set(conductorId, { ...conductor, worktreeRequest });
    this.#deps.onChange();
    return worktreeRequest;
  }

  /**
   * Settles the pending worktree request; `path` is the created folder, null when the person declined.
   * Returns the settled request so the caller can open its first worker.
   */
  settleWorktree(conductorId: string, requestId: string, path: string | null, error?: string): WorktreeRequest | null {
    const conductor = this.#conductors.get(conductorId);
    const request = conductor?.worktreeRequest;
    if (!conductor || !request || request.id !== requestId) return null;
    const paths = path && !conductor.scope.paths.includes(path) ? [...conductor.scope.paths, path] : conductor.scope.paths;
    this.#conductors.set(conductorId, { ...conductor, scope: { ...conductor.scope, paths }, worktreeRequest: null });
    this.#deps.onChange();
    const next = request.prompt ? "첫 요청을 담아 이 폴더에 일꾼을 열었어요. 끝나면 보고가 와요." : "start_session으로 이 폴더에 세션을 열 수 있어요.";
    const text = path
      ? `[Agent Control] 요청한 워크트리 '${request.branch}'를 만들었어요: ${path}\n${next}`
      : `[Agent Control] 요청한 워크트리 '${request.branch}'는 만들지 않았어요.${error ? ` (${error})` : " 사람이 거절했어요."}`;
    this.deliver(conductorId, text, null);
    return request;
  }

  /** A delegate `prompt` is sent to `to` right away; report / next prompts wait for `from` to stop. */
  connect(from: string, to: string, kind: LinkKind, prompt: string | null = null): OrchestrationLink | null {
    if (from === to || !this.#deps.get(from) || !this.#deps.get(to)) return null;
    const existing = this.#links.find((link) => link.from === from && link.to === to && link.kind === kind);
    const link: OrchestrationLink = existing ?? { id: this.#deps.newId(), kind, from, to, prompt, trips: 0, paused: false, createdAt: this.#deps.now() };
    if (!existing) {
      this.#links = [...this.#links, link];
      this.#deps.onChange();
    }
    // A delegate line drawn by a person carries the work itself: it goes to the worker now, and the
    // worker's answer comes back to the delegator, so neither side is left guessing what the line means.
    const delegator = this.#deps.get(from);
    if (kind === "delegate" && prompt && delegator) {
      this.connect(to, from, "report");
      this.deliver(to, delegateText(delegator, prompt), link.id);
    }
    if (kind === "watch" && !existing && delegator) this.deliver(to, watchText(delegator, this.#deps.logUrl(from)), null);
    return link;
  }

  disconnect(linkId: string): boolean {
    const before = this.#links.length;
    this.#links = this.#links.filter((link) => link.id !== linkId);
    if (this.#links.length === before) return false;
    this.#deps.onChange();
    return true;
  }

  /**
   * A delegate line's work still waiting in the worker's queue is swapped for the new text; once it went
   * out, the revision follows it. A next line's text is only read at the next stop.
   */
  edit(linkId: string, prompt: string | null): boolean {
    const link = this.#links.find((item) => item.id === linkId);
    if (!link || link.kind === "report" || link.kind === "watch") return false;
    const text = prompt?.trim() ? prompt : null;
    if (link.kind === "delegate" && !text) return false;
    if (text === link.prompt) return true;
    this.#replace({ ...link, prompt: text });
    const delegator = this.#deps.get(link.from);
    if (link.kind !== "delegate" || !text || !delegator) return true;
    const queue = this.#queues.get(link.to) ?? [];
    if (queue.some((item) => item.link === link.id)) {
      this.#queues.set(link.to, queue.map((item) => (item.link === link.id ? { ...item, text: delegateText(delegator, text) } : item)));
    } else {
      this.deliver(link.to, revisedText(delegator, text), link.id);
    }
    return true;
  }

  resume(linkId: string): boolean {
    const link = this.#links.find((item) => item.id === linkId);
    if (!link) return false;
    this.#replace({ ...link, paused: false, trips: 0 });
    return true;
  }

  /** UserPromptSubmit: a prompt the daemon did not write means a person took over, so bounce counts start over. */
  onPrompt(id: string): void {
    if (this.#inflight.has(id)) {
      this.#inflight.delete(id);
      return;
    }
    this.#fedBy.delete(id);
    const touched = this.#links.filter((link) => link.trips > 0 && (link.from === id || link.to === id));
    touched.forEach((link) => this.#replace({ ...link, trips: 0 }));
  }

  /** Stop: the session finished a turn. Fire its report / next lines, then hand it anything queued. */
  onStop(id: string, answer: string | null): void {
    if (answer?.trim()) this.#answers.set(id, answer);
    this.#inflight.delete(id);
    const from = this.#deps.get(id);
    if (from) {
      const fedBy = this.#links.find((link) => link.id === this.#fedBy.get(id)) ?? null;
      this.#fedBy.delete(id);
      this.#links
        .filter((link) => (link.kind === "report" || link.kind === "next") && link.from === id && !link.paused)
        .forEach((link) => this.#fire(link, from, answer, fedBy));
    }
    this.flush(id);
  }

  /** Puts text into a session now if it is free, otherwise queues it until its next Stop. */
  deliver(to: string, text: string, link: string | null): boolean {
    const target = this.#deps.get(to);
    if (!target || target.status === "exited") return false;
    this.#queues.set(to, [...(this.#queues.get(to) ?? []), { text, link }]);
    this.flush(to);
    return true;
  }

  queued(id: string): number {
    return this.#queues.get(id)?.length ?? 0;
  }

  flush(id: string): void {
    const target = this.#deps.get(id);
    const queue = this.#queues.get(id) ?? [];
    if (!target || queue.length === 0) return;
    if (target.status === "exited") {
      this.#queues.delete(id);
      return;
    }
    const sentAt = this.#inflight.get(id);
    const busy = target.status !== "idle" || target.permission !== null || (sentAt !== undefined && this.#deps.now() - sentAt < INFLIGHT_MS);
    if (busy) return;
    const [next, ...rest] = queue;
    if (!next) return;
    this.#queues.set(id, rest);
    this.#inflight.set(id, this.#deps.now());
    if (next.link) this.#fedBy.set(id, next.link);
    else this.#fedBy.delete(id);
    this.#deps.send(id, next.text);
  }

  #fire(link: OrchestrationLink, from: RunnerSession, answer: string | null, fedBy: OrchestrationLink | null): void {
    const bounced = fedBy !== null && fedBy.from === link.to;
    const trips = bounced ? link.trips + 1 : link.trips;
    if (trips >= MAX_TRIPS) {
      console.log("[runner] link paused after bouncing", link.id, link.from, "->", link.to);
      this.#replace({ ...link, trips, paused: true });
      return;
    }
    if (trips !== link.trips) this.#replace({ ...link, trips });
    const text = link.kind === "report" ? reportText(from, answer) : nextText(from, link.prompt, answer);
    this.deliver(link.to, text, link.id);
  }

  #replace(link: OrchestrationLink): void {
    this.#links = this.#links.map((item) => (item.id === link.id ? link : item));
    this.#deps.onChange();
  }
}
