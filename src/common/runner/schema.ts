import { z } from "zod";

export const runnerSessionSchema = z.object({
  id: z.string(),
  cwd: z.string(),
  kind: z.enum(["claude", "shell"]),
  status: z.enum(["idle", "working", "waiting", "exited"]),
  prompted: z.boolean(),
  startedAt: z.number(),
  updatedAt: z.number(),
  exitCode: z.number().nullable(),
  model: z.string().nullable().catch(null),
  contextPercent: z.number().nullable().catch(null),
  permission: z
    .object({
      id: z.string(),
      receivedAt: z.number(),
      toolName: z.string(),
      toolInput: z.record(z.string(), z.unknown()),
      suggestions: z.array(z.record(z.string(), z.unknown())),
    })
    .nullable()
    .catch(null),
});

export const runnerResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  session: runnerSessionSchema.optional(),
  sessions: z.array(runnerSessionSchema).optional(),
  lines: z.array(z.string()).optional(),
});
