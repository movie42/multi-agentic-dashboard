import type { StepStatus, WorkflowStep } from "@/common/workflow/types";

const CIRCLE: Record<StepStatus, string> = {
  done: "bg-done text-st-ink",
  now: "bg-now text-st-ink",
  ask: "bg-ask text-st-ink",
  wait: "text-muted shadow-[inset_0_0_0_1.5px_var(--faint)]",
  skip: "border-[1.5px] border-dashed border-faint text-faint",
};

const LABEL: Record<StepStatus, string> = {
  done: "text-fg",
  now: "text-fg",
  ask: "text-fg",
  wait: "text-muted",
  skip: "text-faint font-medium",
};

const DETAIL: Record<StepStatus, string> = {
  done: "text-muted",
  now: "text-now",
  ask: "text-ask",
  wait: "text-muted",
  skip: "text-faint",
};

interface StepperProps {
  steps: WorkflowStep[];
  size: "compact" | "full";
}

export function Stepper({ steps, size }: StepperProps) {
  if (size === "compact") {
    return (
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-1.5" title={step.detail ?? undefined}>
            <span
              className={`grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold ${CIRCLE[step.status]}`}
            >
              {index + 1}
            </span>
            <span className={`text-[12px] font-semibold ${LABEL[step.status]}`}>{step.label}</span>
            {(step.status === "now" || step.status === "ask") && step.detail && (
              <span className={`text-[12px] ${DETAIL[step.status]}`}>{step.detail}</span>
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none">
      {steps.map((step, index) => (
        <li key={step.key} className="grid grid-cols-[26px_1fr] gap-x-2.5">
          <span
            className={`row-span-2 grid size-[26px] place-items-center rounded-full text-[12px] font-bold ${CIRCLE[step.status]}`}
          >
            {index + 1}
          </span>
          <b className={`text-[15px] leading-[1.35] font-semibold ${LABEL[step.status]}`}>{step.label}</b>
          <span className={`text-[12px] leading-normal ${DETAIL[step.status]}`}>{step.detail ?? " "}</span>
        </li>
      ))}
    </ol>
  );
}
