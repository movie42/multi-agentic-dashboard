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
  updatedAt: number;
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
