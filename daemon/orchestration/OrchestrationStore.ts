import {
  EMPTY_ORCHESTRATION,
  GRANT_BUNDLES,
  MAX_TRIPS,
  type Conductor,
  type GrantBundle,
  type LinkKind,
  type LinkRequest,
  type OrchestrationState,
  type SessionLink,
  type WorktreeProposal,
} from "../../src/common/orchestration/types.ts";

export interface OrchestrationStoreOptions {
  now?: () => number;
  newId?: () => string;
  onChange?: (state: OrchestrationState) => void;
}

const LINK_KINDS: readonly LinkKind[] = ["delegate", "report", "next"];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function parseLink(value: unknown): SessionLink | null {
  const raw = record(value);
  if (!raw) return null;
  const { id, from, to, kind, createdBy, createdAt, trips, paused } = raw;
  if (!isString(id) || !isString(from) || !isString(to) || from === to) return null;
  const linkKind = LINK_KINDS.find((candidate) => candidate === kind);
  if (!linkKind) return null;
  return {
    id,
    from,
    to,
    kind: linkKind,
    createdBy: createdBy === "conductor" ? "conductor" : "user",
    createdAt: typeof createdAt === "number" ? createdAt : 0,
    trips: typeof trips === "number" && trips >= 0 ? trips : 0,
    paused: paused === true,
  };
}

function parseConductor(value: unknown): Conductor | null {
  const raw = record(value);
  const scope = record(raw?.scope);
  if (!raw || !scope || !isString(raw.sessionId) || !isString(scope.root)) return null;
  const grants = Array.isArray(raw.grants) ? raw.grants.flatMap((grant): GrantBundle[] => GRANT_BUNDLES.filter((bundle) => bundle === grant)) : [];
  const extraGrants = Array.isArray(raw.extraGrants) ? raw.extraGrants.filter(isString) : [];
  return { sessionId: raw.sessionId, scope: { kind: scope.kind === "worktree" ? "worktree" : "project", root: scope.root }, grants, extraGrants };
}

function parseProposal(value: unknown): WorktreeProposal | null {
  const raw = record(value);
  if (!raw) return null;
  const { id, conductorId, name, branch, baseBranch, prompt, createdAt } = raw;
  if (!isString(id) || !isString(conductorId) || !isString(name) || !isString(branch) || !isString(baseBranch)) return null;
  return { id, conductorId, name, branch, baseBranch, prompt: typeof prompt === "string" ? prompt : "", createdAt: typeof createdAt === "number" ? createdAt : 0 };
}

export function parseOrchestration(body: unknown): OrchestrationState {
  const raw = record(body);
  if (!raw) return EMPTY_ORCHESTRATION;
  const list = <T>(value: unknown, parse: (item: unknown) => T | null): T[] =>
    Array.isArray(value) ? value.flatMap((item) => {
      const parsed = parse(item);
      return parsed ? [parsed] : [];
    }) : [];
  return { links: list(raw.links, parseLink), conductors: list(raw.conductors, parseConductor), proposals: list(raw.proposals, parseProposal) };
}

/**
 * State rewritten with the ids sessions will have after a daemon restart: a restored session reopens
 * under the conversation it ended on, so a link must name that conversation, not the terminal's first id.
 * Lines to sessions that will not come back are dropped.
 */
export function persistedOf(state: OrchestrationState, idOf: (sessionId: string) => string | null): OrchestrationState {
  const links = state.links.flatMap((link) => {
    const from = idOf(link.from);
    const to = idOf(link.to);
    return from && to ? [{ ...link, from, to }] : [];
  });
  const conductors = state.conductors.flatMap((conductor) => {
    const sessionId = idOf(conductor.sessionId);
    return sessionId ? [{ ...conductor, sessionId }] : [];
  });
  const proposals = state.proposals.flatMap((proposal) => {
    const conductorId = idOf(proposal.conductorId);
    return conductorId ? [{ ...proposal, conductorId }] : [];
  });
  return { links, conductors, proposals };
}

export class OrchestrationStore {
  #state: OrchestrationState = EMPTY_ORCHESTRATION;
  #now: () => number;
  #newId: () => string;
  #onChange: (state: OrchestrationState) => void;

  constructor(options: OrchestrationStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#newId = options.newId ?? (() => crypto.randomUUID());
    this.#onChange = options.onChange ?? (() => {});
  }

  state(): OrchestrationState {
    return this.#state;
  }

  load(state: OrchestrationState): void {
    this.#state = state;
  }

  #set(next: OrchestrationState): void {
    this.#state = next;
    this.#onChange(next);
  }

  addLink(request: LinkRequest, createdBy: SessionLink["createdBy"]): SessionLink {
    if (request.from === request.to) throw new Error("세션을 자기 자신에게 이을 수 없어요.");
    const existing = this.#state.links.find((link) => link.from === request.from && link.to === request.to && link.kind === request.kind);
    if (existing) return existing;
    const link: SessionLink = { id: this.#newId(), ...request, createdBy, createdAt: this.#now(), trips: 0, paused: false };
    this.#set({ ...this.#state, links: [...this.#state.links, link] });
    return link;
  }

  removeLink(id: string): boolean {
    const links = this.#state.links.filter((link) => link.id !== id);
    if (links.length === this.#state.links.length) return false;
    this.#set({ ...this.#state, links });
    return true;
  }

  resumeLink(id: string): boolean {
    const target = this.#state.links.find((link) => link.id === id);
    if (!target) return false;
    // A loop pauses as a whole, so resuming one line resumes the lines back too.
    const back = new Set(this.#state.links.filter((link) => link.from === target.to && link.to === target.from).map((link) => link.id));
    this.#set({
      ...this.#state,
      links: this.#state.links.map((link) => (link.id === id || back.has(link.id) ? { ...link, trips: 0, paused: false } : link)),
    });
    return true;
  }

  linksFrom(sessionId: string): SessionLink[] {
    return this.#state.links.filter((link) => link.from === sessionId);
  }

  hasLinkBack(link: SessionLink): boolean {
    return this.#state.links.some((other) => other.from === link.to && other.to === link.from && other.kind !== "delegate");
  }

  /** Counts a delivery on a link that can loop; returns false and pauses the link once it reaches the limit. */
  countTrip(id: string): boolean {
    const link = this.#state.links.find((candidate) => candidate.id === id);
    if (!link || link.paused) return false;
    if (!this.hasLinkBack(link)) return true;
    if (link.trips >= MAX_TRIPS) {
      this.#set({ ...this.#state, links: this.#state.links.map((candidate) => (candidate.id === id ? { ...candidate, paused: true } : candidate)) });
      return false;
    }
    this.#set({ ...this.#state, links: this.#state.links.map((candidate) => (candidate.id === id ? { ...candidate, trips: candidate.trips + 1 } : candidate)) });
    return true;
  }

  addConductor(conductor: Conductor): void {
    this.#set({ ...this.#state, conductors: [...this.#state.conductors.filter((entry) => entry.sessionId !== conductor.sessionId), conductor] });
  }

  conductor(sessionId: string): Conductor | null {
    return this.#state.conductors.find((entry) => entry.sessionId === sessionId) ?? null;
  }

  /** The conductor that delegated work to this session, if any. */
  conductorOf(workerId: string): Conductor | null {
    const link = this.#state.links.find((entry) => entry.kind === "delegate" && entry.to === workerId && this.conductor(entry.from));
    return link ? this.conductor(link.from) : null;
  }

  addExtraGrant(conductorId: string, grant: string): boolean {
    const conductor = this.conductor(conductorId);
    if (!conductor) return false;
    if (conductor.extraGrants.includes(grant)) return true;
    this.addConductor({ ...conductor, extraGrants: [...conductor.extraGrants, grant] });
    return true;
  }

  addProposal(proposal: Omit<WorktreeProposal, "id" | "createdAt">): WorktreeProposal {
    const created: WorktreeProposal = { ...proposal, id: this.#newId(), createdAt: this.#now() };
    this.#set({ ...this.#state, proposals: [...this.#state.proposals, created] });
    return created;
  }

  takeProposal(id: string): WorktreeProposal | null {
    const proposal = this.#state.proposals.find((entry) => entry.id === id) ?? null;
    if (proposal) this.#set({ ...this.#state, proposals: this.#state.proposals.filter((entry) => entry.id !== id) });
    return proposal;
  }

  /** Drops everything that names a session once it is closed for good. */
  forgetSession(sessionId: string): void {
    const links = this.#state.links.filter((link) => link.from !== sessionId && link.to !== sessionId);
    const conductors = this.#state.conductors.filter((conductor) => conductor.sessionId !== sessionId);
    const proposals = this.#state.proposals.filter((proposal) => proposal.conductorId !== sessionId);
    if (links.length === this.#state.links.length && conductors.length === this.#state.conductors.length && proposals.length === this.#state.proposals.length) return;
    this.#set({ links, conductors, proposals });
  }
}
