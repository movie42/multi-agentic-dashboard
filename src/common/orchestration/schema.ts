import { z } from "zod";
import { GRANT_BUNDLES } from "./types";

export const orchestrationStateSchema = z.object({
  links: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      kind: z.enum(["delegate", "report", "next"]),
      createdBy: z.enum(["user", "conductor"]),
      createdAt: z.number(),
      trips: z.number(),
      paused: z.boolean(),
    }),
  ),
  conductors: z.array(
    z.object({
      sessionId: z.string(),
      scope: z.object({ kind: z.enum(["project", "worktree"]), root: z.string() }),
      grants: z.array(z.enum(GRANT_BUNDLES)),
      extraGrants: z.array(z.string()),
    }),
  ),
  proposals: z.array(
    z.object({
      id: z.string(),
      conductorId: z.string(),
      name: z.string(),
      branch: z.string(),
      baseBranch: z.string(),
      prompt: z.string(),
      createdAt: z.number(),
    }),
  ),
});
