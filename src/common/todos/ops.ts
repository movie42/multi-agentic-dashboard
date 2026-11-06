import { z } from "zod";
import { SESSION_ID } from "../sessions/limits";
import {
  createColumn,
  createStatus,
  deleteColumn,
  deleteStatus,
  moveCard,
  reorderColumns,
  reorderStatuses,
  setColumnStatuses,
  statusOf,
  TodoRuleError,
  updateCard,
  updateColumn,
  updateStatus,
} from "./board";
import { parseJiraUrl } from "./jira";
import { TODO_MEMO_LIMIT, TODO_NAME_LIMIT, TODO_TITLE_LIMIT } from "./schema";
import { STATUS_KINDS, type TodoBoard, type TodoCard, type TodoJira } from "./types";

const id = z.string().min(1).max(100);
const absolutePath = z.string().refine((value) => value.startsWith("/"), "absolute path required");
const sessionId = z.string().regex(SESSION_ID);
const title = z
  .string()
  .max(TODO_TITLE_LIMIT)
  .refine((value) => value.trim().length > 0 && !/[\r\n]/.test(value));
const name = z
  .string()
  .max(TODO_NAME_LIMIT)
  .refine((value) => value.trim().length > 0 && !/[\r\n]/.test(value));
const kind = z.enum(STATUS_KINDS);

export const todoOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("card-create"),
    title,
    memo: z.string().max(TODO_MEMO_LIMIT).optional(),
    statusId: id.optional(),
    repo: z.string().nullable().optional(),
    worktreePath: absolutePath.nullable().optional(),
    sessionIds: z.array(sessionId).max(50).optional(),
  }),
  z.object({
    type: z.literal("card-update"),
    cardId: id,
    title: title.optional(),
    memo: z.string().max(TODO_MEMO_LIMIT).optional(),
    jiraUrls: z.array(z.string().max(2000)).max(20).optional(),
    repo: z.string().nullable().optional(),
    worktreePath: absolutePath.nullable().optional(),
  }),
  z.object({ type: z.literal("card-move"), cardId: id, statusId: id, source: z.enum(["user", "auto"]).optional() }),
  z.object({ type: z.literal("card-delete"), cardId: id }),
  z.object({ type: z.literal("card-hide"), cardId: id, hidden: z.boolean() }),
  z.object({ type: z.literal("card-launch"), cardId: id }),
  z.object({ type: z.literal("session-attach"), cardId: id, sessionId }),
  z.object({ type: z.literal("session-detach"), cardId: id, sessionId }),
  z.object({ type: z.literal("status-create"), name, kind, columnId: id.optional() }),
  z.object({ type: z.literal("status-update"), statusId: id, name: name.optional(), kind: kind.optional() }),
  z.object({ type: z.literal("status-delete"), statusId: id, moveTo: id.optional() }),
  z.object({ type: z.literal("status-reorder"), statusIds: z.array(id).max(50) }),
  z.object({ type: z.literal("column-create"), name }),
  z.object({
    type: z.literal("column-update"),
    columnId: id,
    name: name.optional(),
    hidden: z.boolean().optional(),
    statusIds: z.array(id).max(50).optional(),
  }),
  z.object({ type: z.literal("column-delete"), columnId: id, moveStatusesTo: id.optional() }),
  z.object({ type: z.literal("column-reorder"), columnIds: z.array(id).max(50) }),
]);

export type TodoOp = z.infer<typeof todoOpSchema>;

export interface TodoOpContext {
  now: number;
  newId: () => string;
}

export interface TodoOpResult {
  board: TodoBoard;
  createdId?: string;
}

function parseJiraUrls(urls: readonly string[]): TodoJira[] {
  return urls
    .filter((url) => url.trim())
    .map((url) => parseJiraUrl(url) ?? fail(`지라 이슈 주소가 아니에요: ${url}`))
    .filter((jira, index, all) => all.findIndex((each) => each.key === jira.key) === index);
}

function fail(message: string): never {
  throw new TodoRuleError(message);
}

function cardOf(board: TodoBoard, cardId: string): TodoCard {
  return board.cards.find((card) => card.id === cardId) ?? fail("카드를 찾을 수 없어요");
}

export function applyTodoOp(board: TodoBoard, op: TodoOp, { now, newId }: TodoOpContext): TodoOpResult {
  switch (op.type) {
    case "card-create": {
      const statusId = op.statusId ?? board.statuses[0]?.id ?? fail("상태 목록이 비어 있어요");
      if (!statusOf(board, statusId)) fail("상태를 찾을 수 없어요");
      const cardId = newId();
      const sessionIds = op.sessionIds ?? [];
      const card: TodoCard = {
        id: cardId,
        title: op.title.trim(),
        memo: op.memo ?? "",
        statusId,
        jira: [],
        sessionIds,
        repo: op.repo ?? null,
        worktreePath: op.worktreePath ?? null,
        hidden: false,
        autoMovedAt: null,
        pendingLaunch: null,
        createdAt: now,
        updatedAt: now,
      };
      const others = board.cards.map((each) => detachSessions(each, sessionIds, now));
      return { board: { ...board, cards: [...others, card] }, createdId: cardId };
    }
    case "card-update": {
      const patch: Partial<TodoCard> = {
        ...(op.title !== undefined && { title: op.title.trim() }),
        ...(op.memo !== undefined && { memo: op.memo }),
        ...(op.jiraUrls !== undefined && { jira: parseJiraUrls(op.jiraUrls) }),
        ...(op.repo !== undefined && { repo: op.repo }),
        ...(op.worktreePath !== undefined && { worktreePath: op.worktreePath }),
      };
      return { board: updateCard(board, op.cardId, patch, now) };
    }
    case "card-move":
      return { board: moveCard(board, op.cardId, op.statusId, now, op.source === "auto") };
    case "card-delete":
      cardOf(board, op.cardId);
      return { board: { ...board, cards: board.cards.filter((card) => card.id !== op.cardId) } };
    case "card-hide":
      return { board: updateCard(board, op.cardId, { hidden: op.hidden }, now) };
    case "card-launch": {
      const card = cardOf(board, op.cardId);
      if (!card.worktreePath) fail("카드에 워크트리를 먼저 골라 주세요");
      return { board: updateCard(board, op.cardId, { pendingLaunch: { worktreePath: card.worktreePath, at: now } }, now) };
    }
    case "session-attach": {
      const target = cardOf(board, op.cardId);
      const cards = board.cards.map((card) =>
        card.id === target.id
          ? card.sessionIds.includes(op.sessionId)
            ? card
            : { ...card, sessionIds: [...card.sessionIds, op.sessionId], updatedAt: now }
          : detachSessions(card, [op.sessionId], now),
      );
      return { board: { ...board, cards } };
    }
    case "session-detach": {
      const card = cardOf(board, op.cardId);
      return { board: updateCard(board, card.id, { sessionIds: card.sessionIds.filter((each) => each !== op.sessionId) }, now) };
    }
    case "status-create": {
      const statusId = newId();
      return { board: createStatus(board, { id: statusId, name: op.name.trim(), kind: op.kind, columnId: op.columnId }), createdId: statusId };
    }
    case "status-update":
      return { board: updateStatus(board, op.statusId, { ...(op.name !== undefined && { name: op.name.trim() }), ...(op.kind !== undefined && { kind: op.kind }) }) };
    case "status-delete":
      return { board: deleteStatus(board, op.statusId, op.moveTo, now) };
    case "status-reorder":
      return { board: reorderStatuses(board, op.statusIds) };
    case "column-create": {
      const columnId = newId();
      return { board: createColumn(board, { id: columnId, name: op.name.trim() }), createdId: columnId };
    }
    case "column-update": {
      const renamed = updateColumn(board, op.columnId, {
        ...(op.name !== undefined && { name: op.name.trim() }),
        ...(op.hidden !== undefined && { hidden: op.hidden }),
      });
      return { board: op.statusIds ? setColumnStatuses(renamed, op.columnId, op.statusIds) : renamed };
    }
    case "column-delete":
      return { board: deleteColumn(board, op.columnId, op.moveStatusesTo) };
    case "column-reorder":
      return { board: reorderColumns(board, op.columnIds) };
  }
}

function detachSessions(card: TodoCard, sessionIds: readonly string[], now: number): TodoCard {
  if (!card.sessionIds.some((each) => sessionIds.includes(each))) return card;
  return { ...card, sessionIds: card.sessionIds.filter((each) => !sessionIds.includes(each)), updatedAt: now };
}
