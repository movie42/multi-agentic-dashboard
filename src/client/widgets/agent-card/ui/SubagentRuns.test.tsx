import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubagentRuns } from "./SubagentRuns";

describe("SubagentRuns", () => {
  it("shows nothing without running subagents", () => {
    const { container } = render(<SubagentRuns runs={[]} />);
    expect(container.textContent).toBe("");
  });

  it("opens to what each subagent is doing", () => {
    render(<SubagentRuns runs={[{ id: "x", description: "Review the diff", agentType: "fork", activity: "Read · /a.ts", updatedAt: 0 }]} />);
    expect(screen.queryByText("Read · /a.ts")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /서브 에이전트 1개 실행 중/ }));
    expect(screen.getByText("Review the diff")).toBeTruthy();
    expect(screen.getByText("Read · /a.ts")).toBeTruthy();
  });
});
