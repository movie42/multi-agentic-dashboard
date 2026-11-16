import { z } from "zod";
import { GRANT_BUNDLES, LINK_KINDS } from "../orchestration/types";

const orchestrationSchema = z.object({
  conductor: z
    .object({
      scope: z.object({ kind: z.enum(["project", "worktree"]), root: z.string(), paths: z.array(z.string()) }),
      grants: z.array(z.enum(GRANT_BUNDLES)),
      rules: z.array(z.object({ toolName: z.string(), prefix: z.string().nullable() })),
      worktreeRequest: z
        .object({ id: z.string(), branch: z.string(), base: z.string().nullable(), reason: z.string(), prompt: z.string().nullable().optional().transform((value) => value ?? null), requestedAt: z.number() })
        .nullable(),
    })
    .nullable(),
  parentId: z.string().nullable(),
  links: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(LINK_KINDS),
      from: z.string(),
      to: z.string(),
      prompt: z.string().nullable(),
      trips: z.number(),
      paused: z.boolean(),
      createdAt: z.number(),
    }),
  ),
});

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
  conversationId: z.string().nullable().catch(null),
  permission: z
    .object({
      id: z.string(),
      receivedAt: z.number(),
      toolName: z.string(),
      toolInput: z.record(z.string(), z.unknown()),
      suggestions: z.array(z.record(z.string(), z.unknown())),
      delegatedTo: z.string().nullable().optional().catch(null),
    })
    .nullable()
    .catch(null),
  orchestration: orchestrationSchema.nullable().catch(null),
});

export const runnerResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  session: runnerSessionSchema.optional(),
  sessions: z.array(runnerSessionSchema).optional(),
  lines: z.array(z.string()).optional(),
});
