import { describe, expect, it, vi } from "vitest";
import { proposalsFromOutput, revisePrompt } from "./commandAgent";

const output = (structured: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify([{ type: "system" }, { type: "result", is_error: false, structured_output: structured, ...extra }]);

describe("proposalsFromOutput", () => {
  it("keeps valid one-line commands with their reason", () => {
    const proposals = proposalsFromOutput(
      output({
        commands: [
          { name: " 빌드 ", command: "bun run build", why: "package.json scripts.build" },
          { name: "여러 줄", command: "a\nb", why: "" },
          { name: "빌드", command: "bun run build:again", why: "중복" },
        ],
      }),
    );
    expect(proposals).toEqual([{ name: "빌드", command: "bun run build", why: "package.json scripts.build" }]);
  });

  it("surfaces an agent error and a missing list", () => {
    expect(() => proposalsFromOutput(output(null, { is_error: true, result: "rate limited" }))).toThrow("rate limited");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => proposalsFromOutput(output({ nope: [] }))).toThrow("명령 목록을 돌려주지 않았어요");
  });
});

describe("revisePrompt", () => {
  it("hands the agent the current list and the request", () => {
    const prompt = revisePrompt([{ name: "빌드", command: "bun run build" }], " 재설치 추가해 줘 ");
    expect(prompt).toContain('[{"name":"빌드","command":"bun run build"}]');
    expect(prompt).toContain("요청: 재설치 추가해 줘");
  });
});
