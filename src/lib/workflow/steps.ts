import type {
  FlowStageStatus,
  FlowTaskSummary,
  PullRequestInfo,
  StepStatus,
  WorkflowMode,
  WorkflowStep,
} from "./types";

function fromStage(status: FlowStageStatus | null): StepStatus {
  return status ?? "skip";
}

function merge(statuses: StepStatus[]): StepStatus {
  const present = statuses.filter((status) => status !== "skip");
  if (present.length === 0) return "skip";
  if (present.includes("ask")) return "ask";
  if (present.includes("now")) return "now";
  if (present.every((status) => status === "done")) return "done";
  return present.some((status) => status === "done") ? "now" : "wait";
}

function grillStep(task: FlowTaskSummary | null): { status: StepStatus; detail: string | null } {
  if (!task?.grill) return { status: "skip", detail: null };
  if (task.grill.open > 0) return { status: "ask", detail: `${task.grill.open}개 대기` };
  return { status: "done", detail: null };
}

function planStep(task: FlowTaskSummary | null): { status: StepStatus; detail: string | null } {
  return { status: merge([fromStage(task?.plan ?? null), fromStage(task?.screen ?? null)]), detail: null };
}

function tasksPlanStep(task: FlowTaskSummary | null): { status: StepStatus; detail: string | null } {
  const tasks = task?.tasks;
  if (!tasks) return { status: "wait", detail: null };
  if (tasks.status === "wait") return { status: "wait", detail: null };
  if (tasks.status === "ask" && tasks.implDone === 0) return { status: "ask", detail: "승인 대기" };
  return { status: "done", detail: null };
}

function buildStep(task: FlowTaskSummary | null): { status: StepStatus; detail: string | null } {
  const tasks = task?.tasks;
  if (!tasks || tasks.implTotal === 0) return { status: "wait", detail: null };
  const detail = `${tasks.implDone}/${tasks.implTotal}`;
  if (tasks.status === "done" || tasks.implDone === tasks.implTotal) return { status: "done", detail };
  if (tasks.status === "now") return { status: "now", detail };
  if (tasks.status === "ask" && tasks.implDone > 0) return { status: "ask", detail: `${detail} 막힘` };
  return { status: "wait", detail };
}

function verifyStep(task: FlowTaskSummary | null): { status: StepStatus; detail: string | null } {
  const verify = task?.verify;
  if (!verify) return { status: "skip", detail: null };
  const detail = verify.total > 0 ? `${verify.done}/${verify.total}` : null;
  if (verify.total > 0 && verify.done === verify.total) return { status: "done", detail };
  return { status: verify.status, detail };
}

function testStep(task: FlowTaskSummary | null): { status: StepStatus; detail: string | null } {
  const tasks = task?.tasks;
  if (!tasks || tasks.testTotal === 0) return { status: tasks ? "skip" : "wait", detail: null };
  const detail = `${tasks.testDone}/${tasks.testTotal}`;
  if (tasks.testDone === tasks.testTotal) return { status: "done", detail };
  return { status: tasks.testDone > 0 ? "now" : "wait", detail };
}

function prStep(pr: PullRequestInfo): { status: StepStatus; detail: string | null } {
  if (pr.kind === "not-applicable") return { status: "skip", detail: null };
  if (pr.kind === "unknown") return { status: "wait", detail: "확인 실패" };
  if (pr.kind === "loading") return { status: "wait", detail: "확인 중" };
  if (pr.kind === "none") return { status: "wait", detail: null };
  if (pr.state === "MERGED") return { status: "done", detail: `#${pr.number} 머지` };
  if (pr.state === "CLOSED") return { status: "wait", detail: `#${pr.number} 닫힘` };
  return { status: "now", detail: `#${pr.number}${pr.isDraft ? " 초안" : " 리뷰"}` };
}

export function buildSteps(
  mode: WorkflowMode,
  task: FlowTaskSummary | null,
  pr: PullRequestInfo,
): WorkflowStep[] {
  const grill = grillStep(task);
  const plan = planStep(task);
  const tail: WorkflowStep[] = [
    { key: "tasks-plan", label: "계획", ...tasksPlanStep(task) },
    { key: "build", label: "구현", ...buildStep(task) },
    { key: "verify", label: "검증", ...verifyStep(task) },
    { key: "test", label: "테스트", ...testStep(task) },
    { key: "pr", label: "PR", ...prStep(pr) },
  ];

  if (mode === "company") {
    return [
      {
        key: "planning-grill",
        label: "기획·질문",
        status: merge([grill.status, plan.status]),
        detail: grill.detail,
      },
      ...tail,
    ];
  }

  return [
    {
      key: "prd",
      label: "PRD",
      status: task?.prdExists ? "done" : "wait",
      detail: null,
    },
    { key: "grill", label: "질문", ...grill },
    { key: "plan", label: "기획", ...plan },
    ...tail,
  ];
}

export function currentStep(steps: WorkflowStep[]): WorkflowStep | null {
  const active = steps.find((step) => step.status === "ask" || step.status === "now");
  if (active) return active;
  return steps.find((step) => step.status === "wait") ?? null;
}
