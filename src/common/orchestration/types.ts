/** A line between two runner sessions that the daemon acts on. */
export type LinkKind = "delegate" | "report" | "next";

export interface SessionLink {
  id: string;
  from: string;
  to: string;
  kind: LinkKind;
  createdBy: "user" | "conductor";
  createdAt: number;
  /** Deliveries made over this link while a link back exists; at the limit the link pauses. */
  trips: number;
  paused: boolean;
}

/** Permission bundles a person hands to a conductor when creating it. `git push` is never in one. */
export const GRANT_BUNDLES = ["edit", "test", "commit"] as const;
export type GrantBundle = (typeof GRANT_BUNDLES)[number];

export interface ConductorScope {
  kind: "project" | "worktree";
  /** Project folder for a project conductor, worktree folder for a worktree conductor. */
  root: string;
}

export interface Conductor {
  sessionId: string;
  scope: ConductorScope;
  grants: GrantBundle[];
  /** Grants added one by one from permission cards: a tool name, or `Bash:<command prefix>`. */
  extraGrants: string[];
}

/** A new worktree a conductor asked for; nothing is created until a person confirms it. */
export interface WorktreeProposal {
  id: string;
  conductorId: string;
  name: string;
  branch: string;
  baseBranch: string;
  prompt: string;
  createdAt: number;
}

export interface OrchestrationState {
  links: SessionLink[];
  conductors: Conductor[];
  proposals: WorktreeProposal[];
}

export const EMPTY_ORCHESTRATION: OrchestrationState = { links: [], conductors: [], proposals: [] };

/** How many deliveries a link that has a link back may make before it stops and asks a person. */
export const MAX_TRIPS = 3;

export const ORCHESTRATION_FILE = "orchestration.json";

export interface LaunchConductorRequest {
  cwd: string;
  scope: ConductorScope;
  grants: GrantBundle[];
  prompt: string;
}

export interface LinkRequest {
  from: string;
  to: string;
  kind: LinkKind;
}

export type OrchestrationResponse = { ok: true; orchestration: OrchestrationState } | { ok: false; error: string };
