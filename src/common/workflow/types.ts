export type FlowStageStatus = "done" | "now" | "ask" | "wait";

export interface FlowTaskSummary {
  taskId: string;
  title: string;
  domain: string;
  branch: string | null;
  pageIndex: string | null;
  prdExists: boolean;
  grill: { open: number; total: number } | null;
  plan: FlowStageStatus | null;
  screen: FlowStageStatus | null;
  tasks: {
    status: FlowStageStatus;
    implDone: number;
    implTotal: number;
    testDone: number;
    testTotal: number;
  } | null;
  verify: { status: FlowStageStatus; done: number; total: number } | null;
  featureDoc: string | null;
  updatedAt: number;
}

export interface FeatureRowSummary {
  id: string;
  title: string;
  issue: string | null;
  branch: string | null;
  worktree: string | null;
  jiraStatus: string | null;
  jiraTodo: string | null;
}

export type SharedWaitReason =
  | { kind: "pr"; pullRequest: PullRequestInfo; branch: string }
  | { kind: "unresolved"; buildIn: string };

export interface SharedWait {
  item: string;
  usedBy: string[];
  reason: SharedWaitReason;
}

export interface FeatureSummary {
  id: string;
  title: string;
  root: string | null;
  docPath: string;
  repo: string | null;
  pageIndex: string | null;
  repoPath: string | null;
  rows: FeatureRowSummary[];
  sharedWaits: SharedWait[];
}

export type PullRequestInfo =
  | { kind: "none" }
  | { kind: "not-applicable" }
  | { kind: "unknown" }
  | { kind: "loading" }
  | {
      kind: "found";
      number: number;
      state: "OPEN" | "MERGED" | "CLOSED";
      isDraft: boolean;
      url: string;
    };

export type WorkflowMode = "company" | "personal";

export type StepKey =
  | "prd"
  | "grill"
  | "plan"
  | "planning-grill"
  | "tasks-plan"
  | "build"
  | "verify"
  | "test"
  | "pr";

export type StepStatus = "done" | "now" | "ask" | "wait" | "skip";

export interface WorkflowStep {
  key: StepKey;
  label: string;
  status: StepStatus;
  detail: string | null;
}
