import { z } from "zod";
import { permissionAnswerSchema } from "../permissions/schema";
import { BOOKMARK_MEMO_LIMIT, SESSION_ID, TITLE_LIMIT } from "../sessions/limits";

export const MAX_PROMPT = 8000;
export const MAX_CLOSE_TERMINALS = 50;

const absolutePath = z.string().refine((value) => value.startsWith("/"), "absolute path required");
const sessionId = z.string().regex(SESSION_ID);
const title = z
  .string()
  .max(TITLE_LIMIT)
  .refine((value) => value.trim().length > 0 && !/[\r\n]/.test(value));

export const actionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open-artifact"), target: z.string(), via: z.enum(["system", "orca"]), worktreePath: z.string() }),
  z.object({ type: z.literal("focus-terminal"), terminalHandle: z.string() }),
  z.object({ type: z.literal("close-terminal"), terminalHandle: z.string() }),
  z.object({ type: z.literal("close-terminals"), terminalHandles: z.array(z.string()).min(1).max(MAX_CLOSE_TERMINALS) }),
  z.object({ type: z.literal("resume-session"), sessionId, cwd: absolutePath, title: z.string() }),
  z.object({ type: z.literal("rename-session"), sessionId, title }),
  z.object({
    type: z.literal("bookmark-session"),
    sessionId,
    name: z.string().max(TITLE_LIMIT).refine((value) => value.trim().length > 0),
    cwd: absolutePath,
    memo: z.string().max(BOOKMARK_MEMO_LIMIT),
  }),
  z.object({ type: z.literal("unbookmark-session"), sessionId }),
  z.object({
    type: z.literal("send-prompt"),
    terminalHandle: z.string(),
    text: z.string().max(MAX_PROMPT).refine((value) => value.trim().length > 0),
  }),
  z.object({ type: z.literal("choose-option"), terminalHandle: z.string(), option: z.number().int().min(1).max(9) }),
  z.object({ type: z.literal("launch-agent"), worktreePath: absolutePath, prompt: z.string().max(MAX_PROMPT) }),
  z.object({ type: z.literal("open-terminal"), worktreePath: absolutePath }),
  z.object({ type: z.literal("remove-worktree"), worktreePath: absolutePath, force: z.boolean() }),
  z.object({ type: z.literal("import-project"), path: absolutePath }),
  z.object({ type: z.literal("answer-permission"), requestId: z.string(), answer: permissionAnswerSchema }),
]);

export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionResponse = { ok: true } | { ok: false; error: string };
export type FolderPickResponse = { ok: true; path: string | null } | { ok: false; error: string };
export type AttachmentResponse = { ok: true; path: string } | { ok: false; error: string };
