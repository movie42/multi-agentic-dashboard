import { z } from "zod";

const absolutePath = z.string().refine((value) => value.startsWith("/"), "absolute path required");
const refName = z.string().min(1).max(200).refine((value) => !value.startsWith("-") && !/[\s\0]/.test(value));
const sha = z.string().regex(/^[0-9a-f]{7,40}$/);

export const switchBranchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), worktreePath: absolutePath, branch: refName }),
  z.object({ kind: z.literal("remote"), worktreePath: absolutePath, remoteBranch: refName }),
  z.object({ kind: z.literal("new"), worktreePath: absolutePath, name: refName, from: sha }),
]);

export type SwitchBranchRequest = z.infer<typeof switchBranchSchema>;

export const SHA_PATTERN = /^[0-9a-f]{7,40}$/;
