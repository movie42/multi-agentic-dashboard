import { z } from "zod";
import { CONDUCTOR_SCOPE_KINDS, GRANT_BUNDLES, LINK_KINDS } from "../orchestration/types";
import { BOOKMARK_MEMO_LIMIT, SESSION_ID, TITLE_LIMIT } from "../sessions/limits";

export const MAX_PROMPT = 8000;
export const MAX_CLOSE_TERMINALS = 50;
export const MODEL_CHOICES = ["default", "fable", "opus", "sonnet", "haiku"] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number];
/** Keys a terminal-only menu (folder trust, a picker) is answered with. */
export const TERMINAL_KEYS = ["up", "down", "enter", "escape"] as const;
export type TerminalKey = (typeof TERMINAL_KEYS)[number];
export const MAX_TERMINAL_KEYS = 20;
export const EFFORT_CHOICES = ["auto", "low", "medium", "high", "xhigh", "max"] as const;
export type EffortChoice = (typeof EFFORT_CHOICES)[number];

const absolutePath = z.string().refine((value) => value.startsWith("/"), "absolute path required");
const sessionId = z.string().regex(SESSION_ID);
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
  z.object({ type: z.literal("rename-terminal"), terminalHandle: z.string().min(1), title }),
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
  z.object({
    type: z.literal("a2ui-action"),
    terminalHandle: z.string(),
    surfaceId: z.string().max(128).regex(/^\S+$/),
    name: z.string().max(128).regex(/^\S+$/),
    context: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= MAX_PROMPT),
  }),
  z.object({ type: z.literal("interrupt-session"), terminalHandle: z.string() }),
  z.object({ type: z.literal("press-keys"), terminalHandle: z.string(), keys: z.array(z.enum(TERMINAL_KEYS)).min(1).max(MAX_TERMINAL_KEYS) }),
  z.object({ type: z.literal("set-model"), terminalHandle: z.string(), model: z.enum(MODEL_CHOICES) }),
  z.object({ type: z.literal("set-effort"), terminalHandle: z.string(), effort: z.enum(EFFORT_CHOICES) }),
  z.object({ type: z.literal("toggle-voice"), terminalHandle: z.string(), intent: z.enum(["toggle", "stop"]).default("toggle") }),
  z.object({ type: z.literal("read-voice"), terminalHandle: z.string() }),
  z.object({
    type: z.literal("launch-agent"),
    worktreePath: absolutePath,
    prompt: z.string().max(MAX_PROMPT),
    /** Connects the new session to an existing one right after it starts (the canvas ghost box). */
    link: z.object({ from: z.string().min(1), kind: z.enum(LINK_KINDS) }).optional(),
  }),
  z.object({ type: z.literal("open-terminal"), worktreePath: absolutePath }),
  z.object({ type: z.literal("run-project-command"), worktreePath: absolutePath, projectPath: absolutePath, name: z.string().min(1) }),
  z.object({
    type: z.literal("launch-conductor"),
    /** Null when it is opened outside any project (the 전체 view). */
    worktreePath: absolutePath.nullable(),
    prompt: z.string().max(MAX_PROMPT),
    scope: z.enum(CONDUCTOR_SCOPE_KINDS),
    grants: z.array(z.enum(GRANT_BUNDLES)),
    projects: z.array(absolutePath).default([]),
  }),
  z.object({ type: z.literal("delegate-permission"), terminalHandle: z.string(), requestId: z.string() }),
  z.object({
    type: z.literal("connect-sessions"),
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(LINK_KINDS),
    prompt: z.string().max(MAX_PROMPT).nullable(),
  }),
  z.object({ type: z.literal("unlink-sessions"), linkId: z.string() }),
  z.object({ type: z.literal("resume-link"), linkId: z.string() }),
  z.object({ type: z.literal("edit-link"), linkId: z.string(), prompt: z.string().max(MAX_PROMPT).nullable() }),
  z.object({ type: z.literal("answer-worktree-request"), terminalHandle: z.string(), requestId: z.string(), approve: z.boolean() }),
  z.object({ type: z.literal("answer-project-request"), terminalHandle: z.string(), requestId: z.string(), approve: z.boolean() }),
  z.object({ type: z.literal("remove-worktree"), worktreePath: absolutePath, force: z.boolean() }),
  z.object({ type: z.literal("rename-worktree"), worktreePath: absolutePath, name: title }),
  z.object({ type: z.literal("import-project"), path: absolutePath }),
  z.object({ type: z.literal("remove-project"), repo: z.string().min(1) }),
  z.object({ type: z.literal("stop-dev-port"), pid: z.number().int().positive(), port: z.number().int().positive() }),
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
