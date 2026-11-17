export const CARD_KINDS = ["work", "judge"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface TemplateCard {
  key: string;
  title: string;
  prompt: string;
  kind: CardKind;
  model: string | null;
  effort: string | null;
  continueFrom: boolean;
  pauseAfter: boolean;
  check: string | null;
}

/**
 * The same line kinds as `OrchestrationLink`, minus `delegate`: a run moves one card at a time, so a
 * line can only fire when its source card ends. `next` sends `prompt` (or the last answer when empty);
 * `report` always sends the last answer.
 */
export const ROUTE_KINDS = ["next", "report"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export interface TemplateRoute {
  id: string;
  from: string;
  to: string;
  kind: RouteKind;
  /** The condition a judge card picks by; null on a work card's line. */
  label: string | null;
  prompt: string | null;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  cards: TemplateCard[];
  routes: TemplateRoute[];
  updatedAt: number;
}

export const RUN_STATES = ["expanded", "running", "paused", "done", "stopped"] as const;
export type RunState = (typeof RUN_STATES)[number];

export const HOLD_REASONS = ["pause-after", "check-failed", "no-choice", "trips", "exited"] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export interface RunHold {
  reason: HoldReason;
  text: string;
}

export interface TemplateRun {
  id: string;
  templateId: string;
  name: string;
  cwd: string;
  intent: string;
  cards: TemplateCard[];
  routes: TemplateRoute[];
  state: RunState;
  current: string | null;
  sessions: Record<string, string>;
  choice: { routeId: string; reason: string } | null;
  trips: Record<string, number>;
  hold: RunHold | null;
  createdAt: number;
}

export const MAX_TEMPLATE_PROMPT = 8000;

export const BUILTIN_TEMPLATE_PREFIX = "builtin:";

export const MAX_TEMPLATE_DRAFT = 4000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const optionalText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function cardOf(value: unknown): TemplateCard | null {
  const raw = record(value);
  if (!raw || typeof raw.key !== "string" || !raw.key) return null;
  const kind = CARD_KINDS.find((item) => item === raw.kind) ?? "work";
  return {
    key: raw.key,
    title: text(raw.title).trim() || raw.key,
    prompt: text(raw.prompt).slice(0, MAX_TEMPLATE_PROMPT),
    kind,
    model: optionalText(raw.model),
    effort: optionalText(raw.effort),
    continueFrom: kind === "work" && raw.continueFrom === true,
    pauseAfter: raw.pauseAfter === true,
    check: optionalText(raw.check),
  };
}

export function routeOf(value: unknown): TemplateRoute | null {
  const raw = record(value);
  if (!raw || typeof raw.id !== "string" || typeof raw.from !== "string" || typeof raw.to !== "string") return null;
  const kind = ROUTE_KINDS.find((item) => item === raw.kind) ?? "next";
  const prompt = kind === "next" && typeof raw.prompt === "string" && raw.prompt.trim() ? raw.prompt.slice(0, MAX_TEMPLATE_PROMPT) : null;
  return { id: raw.id, from: raw.from, to: raw.to, kind, label: optionalText(raw.label), prompt };
}

export function templateOf(value: unknown): WorkflowTemplate | null {
  const raw = record(value);
  if (!raw || typeof raw.id !== "string" || !raw.id) return null;
  const cards = (Array.isArray(raw.cards) ? raw.cards : [])
    .flatMap((item: unknown) => cardOf(item) ?? [])
    .filter((card, index, all) => all.findIndex((other) => other.key === card.key) === index);
  if (cards.length === 0) return null;
  const keys = new Set(cards.map((card) => card.key));
  const routes = (Array.isArray(raw.routes) ? raw.routes : [])
    .flatMap((item: unknown) => routeOf(item) ?? [])
    .filter((route) => keys.has(route.from) && keys.has(route.to) && route.from !== route.to);
  return {
    id: raw.id,
    name: text(raw.name).trim() || "이름 없는 템플릿",
    cards,
    routes,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function templatesOf(value: unknown): WorkflowTemplate[] {
  const list = record(value)?.templates;
  return (Array.isArray(list) ? list : []).flatMap((item: unknown) => templateOf(item) ?? []);
}

function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value) ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function holdOf(value: unknown): RunHold | null {
  const raw = record(value);
  const reason = HOLD_REASONS.find((item) => item === raw?.reason);
  return raw && reason ? { reason, text: text(raw.text) } : null;
}

export function runOf(value: unknown): TemplateRun | null {
  const raw = record(value);
  const state = RUN_STATES.find((item) => item === raw?.state);
  const template = templateOf({ id: raw?.templateId, name: raw?.name, cards: raw?.cards, routes: raw?.routes });
  if (!raw || !state || !template || typeof raw.id !== "string" || typeof raw.cwd !== "string") return null;
  const choice = record(raw.choice);
  return {
    id: raw.id,
    templateId: template.id,
    name: template.name,
    cwd: raw.cwd,
    intent: text(raw.intent),
    cards: template.cards,
    routes: template.routes,
    state,
    current: typeof raw.current === "string" && template.cards.some((card) => card.key === raw.current) ? raw.current : null,
    sessions: stringMap(raw.sessions),
    choice: choice && typeof choice.routeId === "string" ? { routeId: choice.routeId, reason: text(choice.reason) } : null,
    trips: Object.fromEntries(Object.entries(record(raw.trips) ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number")),
    hold: holdOf(raw.hold),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
  };
}

export function runsOf(value: unknown): TemplateRun[] {
  return (Array.isArray(value) ? value : []).flatMap((item: unknown) => runOf(item) ?? []);
}

export function routesFrom(routes: TemplateRoute[], key: string): TemplateRoute[] {
  return routes.filter((route) => route.from === key);
}
