/** Where the wizard was opened: the repo, and the worktree whose branch is the default base. */
export interface WizardOrigin {
  repoId: string;
  repo: string;
  /** Any checkout of the repo; git and claude run here. */
  anchorPath: string;
  /** The worktree the button sits on; null when opened from the project header. */
  from: { path: string; branch: string | null } | null;
}

export interface WorktreePlan {
  name: string;
  branch: string;
  baseBranch: string;
  parent: "from" | "none";
  reference: string | null;
  firstPrompt: string;
  summary: string;
}

export type WizardTurn =
  | { kind: "ask"; question: string; options: string[] }
  | { kind: "plan"; plan: WorktreePlan };

export type WizardRequest =
  | { action: "start"; origin: WizardOrigin }
  | { action: "answer"; origin: WizardOrigin; sessionId: string; answer: string }
  | { action: "create"; origin: WizardOrigin; plan: WorktreePlan };

export type WizardResponse =
  | { ok: true; sessionId: string; turn: WizardTurn }
  | { ok: true; created: { path: string; name: string } }
  | { ok: false; error: string };
