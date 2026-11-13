import { describe, expect, it } from "vitest";
import { actionRequestSchema, MAX_CLOSE_TERMINALS, MAX_PROMPT } from "./schema";

const SESSION = "0b8c1a7e-1234-4abc-8def-0123456789ab";
const ok = (value: unknown) => actionRequestSchema.safeParse(value).success;

describe("actionRequestSchema", () => {
  it.each([
    [{ type: "send-prompt", terminalHandle: "t", text: "hi" }, true],
    [{ type: "send-prompt", terminalHandle: "t", text: "   " }, false],
    [{ type: "send-prompt", terminalHandle: "t", text: "x".repeat(MAX_PROMPT + 1) }, false],
    [{ type: "launch-agent", worktreePath: "/w", prompt: "" }, true],
    [{ type: "launch-agent", worktreePath: "w", prompt: "" }, false],
    [{ type: "rename-session", sessionId: SESSION, title: "새 제목" }, true],
    [{ type: "rename-session", sessionId: SESSION, title: "줄\n바꿈" }, false],
    [{ type: "rename-session", sessionId: "nope", title: "t" }, false],
    [{ type: "bookmark-session", sessionId: SESSION, name: "n", cwd: "/c", memo: "x".repeat(501) }, false],
    [{ type: "open-artifact", target: "/f" }, true],
    [{ type: "open-terminal", worktreePath: "/w" }, true],
    [{ type: "focus-terminal", terminalHandle: "t" }, false],
    [{ type: "toggle-voice", terminalHandle: "t" }, true],
    [{ type: "read-voice", terminalHandle: "t" }, true],
    [{ type: "choose-option", terminalHandle: "t", option: 3 }, false],
    [{ type: "answer-permission", requestId: "r", answer: { behavior: "allow", suggestionIndex: null } }, false],
    [{ type: "close-terminals", terminalHandles: ["a", "b"] }, true],
    [{ type: "close-terminals", terminalHandles: [] }, false],
    [{ type: "close-terminals", terminalHandles: Array.from({ length: MAX_CLOSE_TERMINALS + 1 }, (_, i) => `t${i}`) }, false],
    [{ type: "unknown" }, false],
    [null, false],
  ])("%j → %s", (value, expected) => {
    expect(ok(value)).toBe(expected);
  });
});
