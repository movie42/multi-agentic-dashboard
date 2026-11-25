import { describe, expect, it } from "vitest";
import { validateUiMessages } from "@/common/a2ui/messages";
import type { RunnerPermission } from "@/common/runner/types";
import { permissionSurface } from "./permissionSurface";

const tool: RunnerPermission = {
  id: "req-1",
  receivedAt: 0,
  toolName: "Bash",
  toolInput: { command: "rm -rf dist", description: "빌드 폴더 지우기" },
  suggestions: [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "rm:*" }], destination: "localSettings" }],
};

const components = (messages: ReturnType<typeof permissionSurface>) =>
  JSON.stringify(messages.find((message) => "updateComponents" in message));

describe("permissionSurface", () => {
  it("builds a valid surface with allow, deny, the command and each suggestion", () => {
    const messages = permissionSurface(tool, { denying: false });
    expect(validateUiMessages(messages).ok).toBe(true);
    const json = components(messages);
    expect(json).toContain("rm -rf dist");
    expect(json).toContain("빌드 폴더 지우기");
    expect(json).toContain('"name":"allow"');
    expect(json).toContain('"name":"openDeny"');
    expect(json).toContain("다시 묻지 않기");
    expect(json).toContain("이 프로젝트 (나만)");
  });

  it("swaps the buttons for a reason field while denying", () => {
    const messages = permissionSurface(tool, { denying: true });
    expect(validateUiMessages(messages).ok).toBe(true);
    const json = components(messages);
    expect(json).toContain("거부 사유 (Claude에게 전달돼요)");
    expect(json).toContain('"name":"deny"');
    expect(json).not.toContain('"name":"allow"');
    expect(json).not.toContain("다시 묻지 않기");
  });

  it("shows a plan as markdown with no conductor delegation", () => {
    const plan: RunnerPermission = { ...tool, toolName: "ExitPlanMode", toolInput: { plan: "## 계획\n- 하나" }, suggestions: [] };
    const json = components(permissionSurface(plan, { denying: false }));
    expect(json).toContain("## 계획");
    expect(json).not.toContain('"name":"delegate"');
    expect(json).not.toContain("지휘자");
  });
});
