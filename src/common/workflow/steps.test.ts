import { describe, expect, it } from "vitest";
import { flowTask } from "../../../test/fixtures";
import { buildSteps, currentStep } from "./steps";

const summarize = (steps: ReturnType<typeof buildSteps>) =>
  steps.map((step) => `${step.key}:${step.status}${step.detail ? `(${step.detail})` : ""}`);

describe("buildSteps", () => {
  it("lays out personal mode with no task", () => {
    expect(summarize(buildSteps("personal", null, { kind: "none" }))).toEqual([
      "prd:wait",
      "grill:skip",
      "plan:skip",
      "tasks-plan:wait",
      "build:wait",
      "verify:skip",
      "test:wait",
      "pr:wait",
    ]);
  });

  it("merges grill and plan into one step in company mode", () => {
    const task = flowTask({ grill: { open: 2, total: 5 }, plan: "done" });
    expect(summarize(buildSteps("company", task, { kind: "not-applicable" }))[0]).toBe("planning-grill:ask(2개 대기)");
  });

  it("tracks a task mid-build", () => {
    const task = flowTask({
      prdExists: true,
      grill: { open: 0, total: 3 },
      plan: "done",
      screen: "now",
      tasks: { status: "now", implDone: 3, implTotal: 7, testDone: 1, testTotal: 4 },
      verify: { status: "wait", done: 0, total: 2 },
    });
    expect(summarize(buildSteps("personal", task, { kind: "found", number: 12, state: "OPEN", isDraft: true, url: "" }))).toEqual([
      "prd:done",
      "grill:done",
      "plan:now",
      "tasks-plan:done",
      "build:now(3/7)",
      "verify:wait(0/2)",
      "test:now(1/4)",
      "pr:now(#12 초안)",
    ]);
  });

  it("shows a blocked build and the approval wait", () => {
    const blocked = flowTask({ tasks: { status: "ask", implDone: 2, implTotal: 5, testDone: 0, testTotal: 0 } });
    expect(summarize(buildSteps("personal", blocked, { kind: "unknown" })).slice(3)).toEqual([
      "tasks-plan:done",
      "build:ask(2/5 막힘)",
      "verify:skip",
      "test:skip",
      "pr:wait(확인 실패)",
    ]);
    const approval = flowTask({ tasks: { status: "ask", implDone: 0, implTotal: 5, testDone: 0, testTotal: 0 } });
    expect(summarize(buildSteps("personal", approval, { kind: "loading" }))[3]).toBe("tasks-plan:ask(승인 대기)");
  });
});

describe("currentStep", () => {
  it("prefers ask/now, then the first wait", () => {
    const steps = buildSteps("personal", flowTask({ prdExists: true, grill: { open: 1, total: 1 } }), { kind: "none" });
    expect(currentStep(steps)?.key).toBe("grill");
    expect(currentStep(steps.map((step) => ({ ...step, status: "done" as const })))).toBeNull();
  });
});
