import { z } from "zod";
import { BOOKMARK_MEMO_LIMIT, SESSION_ID, TITLE_LIMIT } from "../sessions/limits";
import { GRANT_BUNDLES } from "../orchestration/types";

export const MAX_PROMPT = 8000;
export const MAX_CLOSE_TERMINALS = 50;
export const MODEL_CHOICES = ["default", "opus", "sonnet", "haiku"] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number];

const absolutePath = z.string().refine((value) => value.startsWith("/"), "absolute path required");
const sessionId = z.string().regex(SESSION_ID);
const runnerId = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const title = z
  .string()
  .max(TITLE_LIMIT)
  .refine((value) => value.trim().length > 0 && !/[\r\n]/.test(value));

export const actionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open-artifact"), target: z.string() }),
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
  z.object({
    type: z.literal("answer-permission"),
    terminalHandle: z.string(),
    requestId: z.string(),
    answer: z.discriminatedUnion("behavior", [
      z.object({ behavior: z.literal("allow"), suggestionIndex: z.number().int().min(0).nullable() }),
      z.object({ behavior: z.literal("answer"), answers: z.record(z.string(), z.string().max(MAX_PROMPT)) }),
      z.object({ behavior: z.literal("deny"), message: z.string().max(MAX_PROMPT) }),
    ]),
  }),
  z.object({ type: z.literal("interrupt-session"), terminalHandle: z.string() }),
  z.object({ type: z.literal("set-model"), terminalHandle: z.string(), model: z.enum(MODEL_CHOICES) }),
  z.object({ type: z.literal("toggle-voice"), terminalHandle: z.string(), intent: z.enum(["toggle", "stop"]).default("toggle") }),
  z.object({ type: z.literal("read-voice"), terminalHandle: z.string() }),
  z.object({ type: z.literal("launch-agent"), worktreePath: absolutePath, prompt: z.string().max(MAX_PROMPT) }),
  z.object({ type: z.literal("open-terminal"), worktreePath: absolutePath }),
  z.object({ type: z.literal("remove-worktree"), worktreePath: absolutePath, force: z.boolean() }),
  z.object({ type: z.literal("rename-worktree"), worktreePath: absolutePath, name: title }),
  z.object({ type: z.literal("import-project"), path: absolutePath }),
  z.object({ type: z.literal("connect-sessions"), from: runnerId, to: runnerId, kind: z.enum(["delegate", "report", "next"]) }),
  z.object({ type: z.literal("disconnect-sessions"), linkId: runnerId }),
  z.object({ type: z.literal("resume-link"), linkId: runnerId }),
  z.object({
    type: z.literal("launch-conductor"),
    cwd: absolutePath,
    scope: z.object({ kind: z.enum(["project", "worktree"]), root: absolutePath }),
    grants: z.array(z.enum(GRANT_BUNDLES)).max(GRANT_BUNDLES.length),
    prompt: z.string().max(MAX_PROMPT),
  }),
  z.object({ type: z.literal("grant-conductor"), conductorId: runnerId, workerId: runnerId }),
  z.object({ type: z.literal("accept-proposal"), proposalId: runnerId }),
  z.object({ type: z.literal("reject-proposal"), proposalId: runnerId }),
]);

export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionResponse = { ok: true } | { ok: false; error: string };
export type VoiceToggleResponse =
  | { ok: true; recording: true }
  | { ok: true; recording: false; transcript: string }
  | { ok: false; error: string };
export type VoiceReadResponse = { ok: true; recording: boolean; transcript: string } | { ok: false; error: string };
export type FolderPickResponse = { ok: true; path: string | null } | { ok: false; error: string };
export type AttachmentResponse = { ok: true; path: string } | { ok: false; error: string };
