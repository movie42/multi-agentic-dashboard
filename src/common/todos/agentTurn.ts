import { statusOf } from "./board";
import { todoOpSchema, type TodoOp } from "./ops";
import type { TodoBoard } from "./types";

/** A session the to-do agent was shown: an open one at the start, or a past one it searched for. */
export interface AgentSessionFact {
  id: string;
  open: boolean;
  /** The card that already holds this session, if any. */
  cardId: string | null;
  repo: string | null;
  worktreeName: string | null;
  worktreePath: string | null;
  branch: string | null;
  state: string;
  title: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  lastMessage: string | null;
  updatedAt: number | null;
}

export const AGENT_OP_TYPES = ["card-create", "card-update", "card-move", "card-delete", "session-attach", "session-detach"] as const;

export type AgentOp = Extract<TodoOp, { type: (typeof AGENT_OP_TYPES)[number] }>;

/** One step the server applies; a new card's Jira links go in a follow-up update once its id exists. */
export interface AgentStep {
  op: AgentOp;
  jiraUrls?: string[];
}

export interface AgentFailure {
  summary: string;
  error: string;
}

/** One agent turn; the client sends `conversationId` back to continue the conversation. */
export interface TodoAgentTurn {
  conversationId: string;
  reply: string;
  /** What changed on the board, one Korean line each, in the order applied. */
  changes: string[];
  failures: AgentFailure[];
}

export type TodoAgentResponse = ({ ok: true } & TodoAgentTurn) | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAgentOp(op: TodoOp): op is AgentOp {
  return AGENT_OP_TYPES.some((type) => type === op.type);
}

function shared<T>(values: readonly T[]): T | null {
  const [first] = values;
  return first !== undefined && values.every((value) => value === first) ? first : null;
}

function rawSummary(item: Record<string, unknown>): string {
  return `${typeof item.type === "string" ? item.type : "?"} ${typeof item.cardId === "string" ? item.cardId : typeof item.title === "string" ? item.title : ""}`.trim();
}

function unknownSessions(op: AgentOp, known: ReadonlySet<string>): string[] {
  if (op.type === "card-create") return (op.sessionIds ?? []).filter((id) => !known.has(id));
  if (op.type === "session-attach") return known.has(op.sessionId) ? [] : [op.sessionId];
  return [];
}

/**
 * Turns the agent's `ops` into steps the board accepts: each must parse as a board op of an allowed
 * type and attach only sessions the agent was shown or the board already holds. A move is always the
 * user's move, since the user asked for it. A `statusId` on an update becomes a separate move.
 */
export function prepareAgentSteps(
  output: unknown,
  board: TodoBoard,
  facts: readonly AgentSessionFact[],
): { steps: AgentStep[]; failures: AgentFailure[] } {
  const raw = isRecord(output) && Array.isArray(output.ops) ? output.ops : [];
  const factOf = new Map(facts.map((fact) => [fact.id, fact]));
  const known = new Set([...factOf.keys(), ...board.cards.flatMap((card) => card.sessionIds)]);
  const steps: AgentStep[] = [];
  const failures: AgentFailure[] = [];

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const parsed = todoOpSchema.safeParse(item);
    if (!parsed.success || !isAgentOp(parsed.data)) {
      failures.push({
        summary: rawSummary(item),
        error: "보드가 받을 수 없는 변경이에요",
      });
      continue;
    }
    const op = parsed.data;
    const missing = unknownSessions(op, known);
    if (missing.length > 0) {
      failures.push({
        summary: rawSummary(item),
        error: `모르는 세션이에요: ${missing.join(", ")}`,
      });
      continue;
    }
    if (op.type === "card-create") {
      const sessionFacts = (op.sessionIds ?? []).flatMap((id) => factOf.get(id) ?? []);
      const jiraUrls = Array.isArray(item.jiraUrls) ? item.jiraUrls.filter((url): url is string => typeof url === "string") : [];
      steps.push({
        op: {
          ...op,
          repo: op.repo ?? shared(sessionFacts.map((fact) => fact.repo)),
          worktreePath: op.worktreePath ?? shared(sessionFacts.map((fact) => fact.worktreePath)),
        },
        ...(jiraUrls.length > 0 && { jiraUrls }),
      });
      continue;
    }
    if (op.type === "card-move") {
      steps.push({ op: { ...op, source: "user" } });
      continue;
    }
    if (op.type === "card-update") {
      if (Object.keys(op).some((key) => key !== "type" && key !== "cardId")) steps.push({ op });
      if (typeof item.statusId === "string")
        steps.push({
          op: {
            type: "card-move",
            cardId: op.cardId,
            statusId: item.statusId,
            source: "user",
          },
        });
      continue;
    }
    steps.push({ op });
  }
  return { steps, failures };
}

function quoted(text: string): string {
  return `‘${text}’`;
}

/** One Korean line naming what the step does, read against the board before it is applied. */
export function describeAgentOp(board: TodoBoard, op: AgentOp, sessionTitle: (id: string) => string): string {
  const cardTitle = (cardId: string) => quoted(board.cards.find((card) => card.id === cardId)?.title ?? cardId);
  const statusName = (statusId: string) => statusOf(board, statusId)?.name ?? statusId;
  switch (op.type) {
    case "card-create": {
      const status = statusName(op.statusId ?? board.statuses[0]?.id ?? "");
      const sessions = op.sessionIds?.length ? ` · 세션 ${op.sessionIds.length}개` : "";
      return `새 카드 ${quoted(op.title.trim())} (${status}${sessions})`;
    }
    case "card-update": {
      const fields = [
        op.title !== undefined && `제목 → ${quoted(op.title.trim())}`,
        op.memo !== undefined && "메모",
        op.jiraUrls !== undefined && "지라",
        op.repo !== undefined && `프로젝트 → ${op.repo ?? "없음"}`,
        op.worktreePath !== undefined && `워크트리 → ${op.worktreePath ?? "없음"}`,
      ].filter((field): field is string => typeof field === "string");
      return `${cardTitle(op.cardId)} 수정: ${fields.join(" · ")}`;
    }
    case "card-move": {
      const from = board.cards.find((card) => card.id === op.cardId)?.statusId;
      return `${cardTitle(op.cardId)} ${from ? statusName(from) : "?"} → ${statusName(op.statusId)}`;
    }
    case "card-delete":
      return `${cardTitle(op.cardId)} 삭제`;
    case "session-attach":
      return `${cardTitle(op.cardId)}에 세션 ${quoted(sessionTitle(op.sessionId))} 붙임`;
    case "session-detach":
      return `${cardTitle(op.cardId)}에서 세션 ${quoted(sessionTitle(op.sessionId))} 뗌`;
  }
}
