import { z } from "zod";

export const orcaEnvelopeSchema = z.looseObject({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});

export const orcaAgentRawSchema = z.looseObject({
  paneKey: z.string(),
  parentPaneKey: z.string().nullable(),
  state: z.string(),
  agentType: z.string().nullable(),
  prompt: z.string().nullable(),
  taskTitle: z.string().nullable(),
  displayName: z.string().nullable(),
  lastAssistantMessage: z.string().nullable(),
  toolName: z.string().nullable(),
  workingMode: z.string().nullish(),
  interrupted: z.boolean(),
  stateStartedAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
  hasLivePty: z.boolean().optional(),
  mainAgent: z.object({ state: z.string(), stateStartedAt: z.number().nullable() }).nullish(),
});

export const orcaWorktreeRawSchema = z.looseObject({
  worktreeId: z.string(),
  repoId: z.string(),
  repo: z.string(),
  path: z.string(),
  branch: z.string().nullable(),
  displayName: z.string().nullable(),
  isArchived: z.boolean(),
  isMainWorktree: z.boolean(),
  isPinned: z.boolean(),
  parentWorktreeId: z.string().nullish(),
  unread: z.boolean(),
  status: z.string(),
  lastActivityAt: z.number().nullable(),
  lastOutputAt: z.number().nullable(),
  agents: z.array(orcaAgentRawSchema),
});

export const orcaTerminalRawSchema = z.looseObject({
  handle: z.string(),
  tabId: z.string(),
  leafId: z.string(),
  worktreeId: z.string(),
  title: z.string().nullable(),
  connected: z.boolean(),
  orphaned: z.boolean().optional(),
  recordedPaneKey: z.string().nullish(),
  agentIdentity: z.string().nullish(),
});

export const worktreePsSchema = z.looseObject({ worktrees: z.array(orcaWorktreeRawSchema) });
export const terminalListSchema = z.looseObject({ terminals: z.array(orcaTerminalRawSchema) });
export const terminalReadSchema = z.looseObject({ terminal: z.looseObject({ tail: z.array(z.string()) }) });
export const orcaStatusSchema = z.looseObject({
  app: z.looseObject({ running: z.boolean(), pid: z.number().nullable(), desktopWindowStatus: z.string().optional() }),
  runtime: z.looseObject({ reachable: z.boolean() }),
});

export type OrcaAgentRaw = z.infer<typeof orcaAgentRawSchema>;
export type OrcaWorktreeRaw = z.infer<typeof orcaWorktreeRawSchema>;
export type OrcaTerminalRaw = z.infer<typeof orcaTerminalRawSchema>;
export type OrcaStatusRaw = z.infer<typeof orcaStatusSchema>;
