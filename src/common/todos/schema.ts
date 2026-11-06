import { z } from "zod";
import { STATUS_KINDS, type TodoBoard } from "./types";

export const TODO_TITLE_LIMIT = 200;
export const TODO_MEMO_LIMIT = 20000;
export const TODO_NAME_LIMIT = 40;

const statusSchema = z.object({ id: z.string().min(1), name: z.string(), kind: z.enum(STATUS_KINDS) });

const columnSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  statusIds: z.array(z.string()),
  hidden: z.boolean(),
});

const cardSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  memo: z.string(),
  statusId: z.string(),
  jira: z.array(z.object({ key: z.string(), url: z.string() })),
  sessionIds: z.array(z.string()),
  repo: z.string().nullable(),
  worktreePath: z.string().nullable(),
  hidden: z.boolean(),
  autoMovedAt: z.number().nullable(),
  pendingLaunch: z.object({ worktreePath: z.string(), at: z.number() }).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const todoBoardSchema: z.ZodType<TodoBoard> = z.object({
  version: z.literal(1),
  statuses: z.array(statusSchema).min(2),
  columns: z.array(columnSchema).min(1),
  cards: z.array(cardSchema),
});
