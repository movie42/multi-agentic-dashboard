import { z } from "zod";
import { isTodoDay } from "./sprint";
import type { TodoBoard, TodoStatus } from "./types";

export const TODO_TITLE_LIMIT = 200;
export const TODO_MEMO_LIMIT = 20000;
export const TODO_NAME_LIMIT = 40;
export const TODO_DESCRIPTION_LIMIT = 200;
export const DEFAULT_WEEK_STARTS_ON = 1;

// Files written before statuses had transitions carry `kind` and no `next`; zod drops `kind`.
const statusSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().default(""),
  next: z.array(z.string()).optional(),
});

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
  links: z.array(z.object({ kind: z.enum(["slack", "notion", "figma", "github-pr", "other"]), url: z.string() })).default([]),
  sessionIds: z.array(z.string()),
  ignoredSessionIds: z.array(z.string()).default([]),
  repo: z.string().nullable(),
  worktreePath: z.string().nullable(),
  hidden: z.boolean(),
  agentMovedAt: z.number().nullable().optional(),
  autoMovedAt: z.number().nullable().optional(),
  doneSuggestedAt: z.number().nullable().default(null),
  pendingLaunch: z.object({ worktreePath: z.string(), at: z.number() }).nullable(),
  doneAt: z.number().nullable().optional(),
  archivedAt: z.number().nullable().default(null),
  origin: z.enum(["jira"]).nullable().default(null),
  dueDate: z.string().refine(isTodoDay).nullable().default(null),
  startDate: z.string().refine(isTodoDay).nullable().default(null),
  jiraParent: z.object({ key: z.string(), summary: z.string() }).nullable().default(null),
  jiraParentChecked: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});

function linearNext(ids: readonly string[], index: number): string[] {
  return [ids[index + 1], ids[index - 1]].filter((id): id is string => id !== undefined);
}

export const todoBoardSchema = z
  .object({
    version: z.literal(1),
    statuses: z.array(statusSchema).min(2),
    columns: z.array(columnSchema).min(1),
    cards: z.array(cardSchema),
    sync: z.object({ jiraImportedAt: z.number().nullable() }).default({ jiraImportedAt: null }),
    settings: z
      .object({ weekStartsOn: z.number().int().min(0).max(6) })
      .default({ weekStartsOn: DEFAULT_WEEK_STARTS_ON }),
  })
  .transform((raw): TodoBoard => {
    const ids = raw.statuses.map((status) => status.id);
    const lastId = ids.at(-1);
    const statuses: TodoStatus[] = raw.statuses.map((status, index) => ({
      id: status.id,
      name: status.name,
      description: status.description,
      next: (status.next ?? linearNext(ids, index)).filter((id) => ids.includes(id) && id !== status.id),
    }));
    return {
      version: 1,
      statuses,
      columns: raw.columns,
      cards: raw.cards.map(({ autoMovedAt, agentMovedAt, doneAt, ...card }) => ({
        ...card,
        agentMovedAt: agentMovedAt ?? autoMovedAt ?? null,
        // Cards already done before doneAt existed start their archive day from their last update.
        doneAt: doneAt !== undefined ? doneAt : card.statusId === lastId ? card.updatedAt : null,
      })),
      sync: raw.sync,
      settings: raw.settings,
    };
  });
