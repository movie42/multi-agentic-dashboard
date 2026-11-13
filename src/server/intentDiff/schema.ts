import { z } from "zod";

const askAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("step"), symbolId: z.string(), file: z.string(), startLine: z.number(), endLine: z.number() }),
  z.object({ kind: z.literal("lines"), file: z.string(), startLine: z.number(), endLine: z.number() }),
]);

const askTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("writer"), sessionId: z.string() }),
  z.object({ kind: z.literal("fresh"), reason: z.enum(["chosen", "no-writer", "writer-gone"]) }),
]);

const askTurnSchema = z.object({
  question: z.string(),
  answer: z.string().nullable(),
  error: z.string().nullable(),
  askedAt: z.number(),
  answeredAt: z.number().nullable(),
});

const askConclusionSchema = z.object({
  text: z.string(),
  needsChange: z.boolean(),
  draftedAt: z.number(),
  confirmedAt: z.number().nullable(),
  sentAt: z.number().nullable(),
});

export const askThreadSchema = z.object({
  id: z.string(),
  worktreePath: z.string(),
  anchor: askAnchorSchema,
  label: z.string(),
  target: askTargetSchema,
  sessionId: z.string(),
  cwd: z.string(),
  turns: z.array(askTurnSchema),
  conclusion: askConclusionSchema.nullish(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const askStoreFileSchema = z.looseObject({ threads: z.array(z.unknown()).catch([]) });

export const snapshotRecordSchema = z.looseObject({
  at: z.number(),
  sessionId: z.string().nullish().transform((value) => value ?? null),
  toolUseId: z.string().nullish().transform((value) => value ?? null),
  tool: z.string(),
  tree: z.string(),
});

const optionalString = z.string().optional().catch(undefined);

const contentBlockSchema = z.looseObject({
  type: optionalString,
  text: optionalString,
  thinking: optionalString,
  id: optionalString,
  name: optionalString,
  input: z.record(z.string(), z.unknown()).optional().catch(undefined),
  tool_use_id: optionalString,
  is_error: z.boolean().optional().catch(undefined),
});

export const transcriptLineSchema = z.looseObject({
  type: optionalString,
  uuid: optionalString,
  sessionId: optionalString,
  timestamp: optionalString,
  isMeta: z.boolean().optional().catch(undefined),
  message: z
    .looseObject({
      content: z
        .union([z.string(), z.array(z.unknown()).transform((blocks) => blocks.flatMap((block) => {
          const parsed = contentBlockSchema.safeParse(block);
          return parsed.success ? [parsed.data] : [];
        }))])
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
  toolUseResult: z.unknown().optional(),
});

export const patchResultSchema = z.looseObject({
  type: z.unknown().optional(),
  content: z.unknown().optional(),
  structuredPatch: z.array(z.looseObject({ lines: z.array(z.string()).optional().catch(undefined) })).optional().catch(undefined),
});

export const recordSchema = z.record(z.string(), z.unknown());

export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;
export type TranscriptLine = z.infer<typeof transcriptLineSchema>;
export type ContentBlock = z.infer<typeof contentBlockSchema>;
