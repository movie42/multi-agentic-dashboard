import { describe, expect, it } from "vitest";
import { nextStatus } from "./status.ts";

describe("nextStatus", () => {
  it("moves to working when a prompt is submitted", () => {
    expect(nextStatus("idle", { event: "UserPromptSubmit" })).toBe("working");
  });

  it("returns to working after a tool runs while waiting for permission", () => {
    expect(nextStatus("waiting", { event: "PostToolUse" })).toBe("working");
  });

  it("moves to waiting on a permission notification", () => {
    expect(nextStatus("working", { event: "Notification", notificationType: "permission_prompt" })).toBe("waiting");
  });

  it("returns to working once a permission is answered from the dashboard", () => {
    expect(nextStatus("waiting", { event: "permission-answered" })).toBe("working");
    expect(nextStatus("idle", { event: "permission-answered" })).toBe("idle");
  });

  it("ignores the idle reminder notification", () => {
    expect(nextStatus("idle", { event: "Notification", notificationType: "idle_prompt" })).toBe("idle");
  });

  it("moves to idle when the turn stops", () => {
    expect(nextStatus("working", { event: "Stop" })).toBe("idle");
  });

  it("moves to idle when the user interrupts a running turn, which sends no Stop hook", () => {
    expect(nextStatus("working", { event: "interrupt" })).toBe("idle");
    expect(nextStatus("waiting", { event: "interrupt" })).toBe("waiting");
  });

  it("stays exited whatever arrives after the process ends", () => {
    expect(nextStatus("working", { event: "exit" })).toBe("exited");
    expect(nextStatus("exited", { event: "UserPromptSubmit" })).toBe("exited");
  });
});
