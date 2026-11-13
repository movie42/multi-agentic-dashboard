import { describe, expect, it } from "vitest";
import { readPrompt, readVoice, toggleVoice, VOICE_DRAFT_ERROR, VOICE_OFF_ERROR, type VoiceTerminal } from "./voice";

function fakeTerminal(screens: { lines: string[]; draft?: string }[]) {
  const typed: string[] = [];
  let index = 0;
  const terminal: VoiceTerminal = {
    readTerminal: async () => {
      const screen = screens[Math.min(index, screens.length - 1)] ?? { lines: [] };
      index += 1;
      return { lines: screen.lines, draft: screen.draft ?? "" };
    },
    type: async (_handle, text) => {
      typed.push(text);
    },
  };
  return { terminal, typed };
}

const RULE = "─".repeat(40);
const idle = { lines: ["❯ "] };
const rec = { lines: ["  ⏺ REC · tap to send", "❯ ▁"] };
const noWait = { sleep: async () => {}, startTimeoutMs: 300, pollMs: 100 };

describe("toggleVoice", () => {
  it("starts recording with one space and reports recording once REC shows", async () => {
    const { terminal, typed } = fakeTerminal([idle, idle, rec]);
    await expect(toggleVoice(terminal, "t", noWait)).resolves.toBe(true);
    expect(typed).toEqual([" "]);
  });

  it("stops a running recording with one space", async () => {
    const { terminal, typed } = fakeTerminal([rec]);
    await expect(toggleVoice(terminal, "t", noWait)).resolves.toBe(false);
    expect(typed).toEqual([" "]);
  });

  it("refuses to start while the terminal input holds a draft", async () => {
    const { terminal, typed } = fakeTerminal([{ lines: ["❯ hello"], draft: "hello" }]);
    await expect(toggleVoice(terminal, "t", noWait)).rejects.toThrow(VOICE_DRAFT_ERROR);
    expect(typed).toEqual([]);
  });

  it("starts when Orca still reports the last sent message but the prompt is empty", async () => {
    const { terminal, typed } = fakeTerminal([{ lines: [RULE, "❯", RULE], draft: "커밋해줘" }, rec]);
    await expect(toggleVoice(terminal, "t", noWait)).resolves.toBe(true);
    expect(typed).toEqual([" "]);
  });

  it("refuses a wrapped multi-line draft that matches the prompt box", async () => {
    const lines = [RULE, "❯\u00a0첫 줄", "  둘째 줄", RULE];
    const { terminal } = fakeTerminal([{ lines, draft: "첫 줄\n둘째 줄" }]);
    await expect(toggleVoice(terminal, "t", noWait)).rejects.toThrow(VOICE_DRAFT_ERROR);
  });

  it("erases the typed space and fails when voice mode never starts", async () => {
    const { terminal, typed } = fakeTerminal([idle]);
    await expect(toggleVoice(terminal, "t", noWait)).rejects.toThrow(VOICE_OFF_ERROR);
    expect(typed).toEqual([" ", "\x7f"]);
  });
});

describe("readPrompt", () => {
  it("reads the prompt box text without the level meter", () => {
    const lines = ["  ⏺ REC · tap to send", RULE, "❯\u00a0한 줄 입력 hello", "  둘째 줄▄", RULE, "  🧠 Opus"];
    expect(readPrompt(lines)).toBe("한 줄 입력 hello\n둘째 줄");
  });

  it("returns an empty string for an empty prompt with only the meter", () => {
    expect(readPrompt([RULE, "❯\u00a0▁", RULE])).toBe("");
  });
});

describe("readVoice", () => {
  it("returns the live transcript while recording", async () => {
    const { terminal } = fakeTerminal([{ lines: ["⏺ REC · tap to send", RULE, "❯\u00a0because of▂", RULE] }]);
    await expect(readVoice(terminal, "t")).resolves.toEqual({ recording: true, transcript: "because of" });
  });

  it("returns no transcript when not recording", async () => {
    const { terminal } = fakeTerminal([{ lines: [RULE, "❯\u00a0typed", RULE] }]);
    await expect(readVoice(terminal, "t")).resolves.toEqual({ recording: false, transcript: "" });
  });
});
