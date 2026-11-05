import { z } from "zod";

export const transcriptEntrySchema = z.looseObject({
  type: z.string().optional().catch(undefined),
  cwd: z.string().optional().catch(undefined),
  gitBranch: z.string().optional().catch(undefined),
  timestamp: z.string().optional().catch(undefined),
  isSidechain: z.boolean().optional().catch(undefined),
  entrypoint: z.string().optional().catch(undefined),
  promptSource: z.string().optional().catch(undefined),
  lastPrompt: z.string().optional().catch(undefined),
  customTitle: z.string().optional().catch(undefined),
  aiTitle: z.string().optional().catch(undefined),
  content: z.unknown().optional(),
  message: z.looseObject({ role: z.string().optional().catch(undefined), content: z.unknown().optional() }).optional().catch(undefined),
});

export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

export const liveSessionFileSchema = z.looseObject({ pid: z.number(), sessionId: z.string(), cwd: z.string() });

export const bookmarkLineSchema = z.looseObject({
  provider: z.string(),
  name: z.string(),
  session_id: z.string(),
  cwd: z.string(),
  created_at: z.string(),
  memo: z.string().optional(),
  last_opened_at: z.string().optional(),
});

export type BookmarkLine = z.infer<typeof bookmarkLineSchema>;

const parsedSessionSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  titleSource: z.enum(["custom", "ai", "none"]),
  cwd: z.string().nullable(),
  project: z.string().nullable(),
  gitBranch: z.string().nullable(),
  firstPrompt: z.string().nullable(),
  lastPrompt: z.string().nullable(),
  lastMessage: z.string().nullable(),
  startedAt: z.number().nullable(),
  updatedAt: z.number(),
  sizeBytes: z.number(),
  origin: z.enum(["human", "headless", "spawned"]),
});

export const sessionCacheEntrySchema = z.object({
  mtimeMs: z.number(),
  size: z.number(),
  value: parsedSessionSchema.nullable(),
});

export const SESSION_CACHE_VERSION = 3;

export const sessionCacheFileSchema = z.object({
  version: z.literal(SESSION_CACHE_VERSION),
  entries: z.array(z.tuple([z.string(), sessionCacheEntrySchema])),
});

export type SessionCacheEntry = z.infer<typeof sessionCacheEntrySchema>;
