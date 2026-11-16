/**
 * A line between two runner sessions. `delegate` only records who handed the work out;
 * `report` and `next` fire when the `from` session finishes a turn (its Stop hook).
 */
export const LINK_KINDS = ["delegate", "report", "next"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export interface OrchestrationLink {
  id: string;
  kind: LinkKind;
  from: string;
  to: string;
  /** What `next` sends to the target; `report` sends the source's last answer instead. */
  prompt: string | null;
  /** Times this line bounced straight back to the session that fed its source. */
  trips: number;
  /** Stopped after too many bounces; fires again only after a person resumes it. */
  paused: boolean;
  createdAt: number;
}

export const MAX_TRIPS = 3;

/** Permission groups a person hands to a conductor when creating it. `git push` is never in one. */
export const GRANT_BUNDLES = ["edit", "build", "commit"] as const;
export type GrantBundle = (typeof GRANT_BUNDLES)[number];

export type ConductorScopeKind = "project" | "worktree";

export interface ConductorScope {
  kind: ConductorScopeKind;
  /** The project or worktree folder the conductor was made for. */
  root: string;
  /** Every worktree folder the conductor may open sessions in. */
  paths: string[];
}

/** A permission a person added from a worker's permission card ("앞으로 지휘자에게 맡기기"). */
export interface DelegatedRule {
  toolName: string;
  /** For Bash, the command prefix the rule covers; null covers every call of the tool. */
  prefix: string | null;
}

export interface WorktreeRequest {
  id: string;
  branch: string;
  base: string | null;
  reason: string;
  /** First request for a worker opened in the new worktree once it exists; that worker reports to the conductor. */
  prompt: string | null;
  requestedAt: number;
}

export interface Conductor {
  scope: ConductorScope;
  grants: GrantBundle[];
  rules: DelegatedRule[];
  worktreeRequest: WorktreeRequest | null;
}

/** What the daemon adds to each runner session about orchestration. */
export interface SessionOrchestration {
  conductor: Conductor | null;
  /** The conductor that handed this session its work (the `delegate` line pointing here). */
  parentId: string | null;
  /** Lines leaving this session. */
  links: OrchestrationLink[];
}

export interface ConductorLaunch {
  scope: ConductorScope;
  grants: GrantBundle[];
}
