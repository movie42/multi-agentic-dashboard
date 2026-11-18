/**
 * A line between two runner sessions. `delegate` only records who handed the work out;
 * `report` and `next` fire when the `from` session finishes a turn (its Stop hook).
 * `watch` lets the `to` session read the `from` terminal's output on demand; it never fires.
 */
export const LINK_KINDS = ["delegate", "report", "next", "watch"] as const;
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

/** `app`: opened outside any project, running in its own empty folder. */
export const CONDUCTOR_SCOPE_KINDS = ["app", "project", "worktree"] as const;
export type ConductorScopeKind = (typeof CONDUCTOR_SCOPE_KINDS)[number];

export interface ConductorScope {
  kind: ConductorScopeKind;
  /** The folder the conductor runs in: its project, its worktree, or the app conductor folder. */
  root: string;
  /** Worktree folders granted one by one: a worktree conductor's worktree and its children, worktrees made on request. */
  paths: string[];
  /** Project folders whose every worktree is in scope, read from git each time so later worktrees count too. */
  projects: string[];
}

/** A permission a person added from a worker's permission card ("앞으로 지휘자에게 맡기기"). */
export interface DelegatedRule {
  toolName: string;
  /** For Bash, the command prefix the rule covers; null covers every call of the tool. */
  prefix: string | null;
}

export interface WorktreeRequest {
  id: string;
  /** The project folder to make it in; null means the conductor's own project. */
  project: string | null;
  branch: string;
  base: string | null;
  reason: string;
  /** First request for a worker opened in the new worktree once it exists; that worker reports to the conductor. */
  prompt: string | null;
  requestedAt: number;
}

/** A conductor asking the person to let it open sessions in one more project. */
export interface ProjectRequest {
  id: string;
  /** Project folder as the conductor named it. */
  path: string;
  reason: string;
  requestedAt: number;
}

export interface Conductor {
  scope: ConductorScope;
  grants: GrantBundle[];
  rules: DelegatedRule[];
  /** Projects on the dashboard when it started, so it can name one in request_project. */
  knownProjects: string[];
  worktreeRequest: WorktreeRequest | null;
  projectRequest: ProjectRequest | null;
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
  knownProjects: string[];
}

export const APP_CONDUCTOR_FOLDER = "conductor";
