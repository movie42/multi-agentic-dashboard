import { describe, expect, it } from "vitest";
import { createVoice, readPrompt, VOICE_DRAFT_ERROR, VOICE_OFF_ERROR, type VoiceTerminal } from "./voice";

function fakeTerminal(screens: { lines: string[] }[]) {
  const typed: string[] = [];
  let index = 0;
  const terminal: VoiceTerminal = {
    screen: async () => {
      const screen = screens[Math.min(index, screens.length - 1)] ?? { lines: [] };
      index += 1;
      return screen.lines;
    },
    type: async (_handle, text) => {
      typed.push(text);
    },
  };
  return { terminal, typed };
}

function liveTerminal(initial: { lines: string[] }) {
  const typed: string[] = [];
  const state = { current: initial };
  const terminal: VoiceTerminal = {
    screen: async () => state.current.lines,
    type: async (_handle, text) => {
      typed.push(text);
    },
  };
  return { terminal, typed, show: (next: { lines: string[] }) => (state.current = next) };
}

const RULE = "─".repeat(40);
const box = (status: string, text: string) => ({ lines: [status, RULE, `❯ ${text}`, RULE, "  🧠 Opus"] });
const idle = box("71127 tokens", "");
const rec = (text = "") => box("  ⏺ REC · tap to send", `${text}▁`);
const listening = (text = "") => box("                listening…", `${text}▁`);
const fast = { sleep: async () => {}, startTimeoutMs: 300, pollMs: 100, settleMs: 200, stopTimeoutMs: 1000 };
const tap = { ...fast, mode: async () => "tap" as const };
const hold = { ...fast, mode: async () => "hold" as const };
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const spaces = (typed: string[]) => typed.filter((key) => key === " ").length;

describe("voice in tap mode", () => {
  it("starts recording with one space", async () => {
    const { terminal, typed } = fakeTerminal([idle, idle, rec()]);
    await expect(createVoice(terminal, tap).toggle("t")).resolves.toEqual({ recording: true });
    expect(typed).toEqual([" "]);
  });

  it("waits for the transcript to settle, discards the terminal recording with Esc and returns the text", async () => {
    const { terminal, typed } = fakeTerminal([rec("안녕"), rec("안녕하세요"), rec("안녕하세요"), rec("안녕하세요")]);
    await expect(createVoice(terminal, tap).toggle("t")).resolves.toEqual({ recording: false, transcript: "안녕하세요" });
    expect(typed).toEqual(["\x1b"]);
  });

  it("does nothing on stop when the terminal is no longer recording", async () => {
    const { terminal, typed } = fakeTerminal([idle]);
    await expect(createVoice(terminal, tap).toggle("t", "stop")).resolves.toEqual({ recording: false, transcript: "" });
    expect(typed).toEqual([]);
  });

  it("tries anyway over a draft and blames the draft only when recording fails", async () => {
    const { terminal, typed } = fakeTerminal([box("", "쓰던 글")]);
    await expect(createVoice(terminal, tap).toggle("t")).rejects.toThrow(VOICE_DRAFT_ERROR);
    expect(typed).toEqual([" ", "\x7f"]);
  });

  it("treats the empty-prompt suggestion as an empty prompt", async () => {
    const { terminal, typed } = fakeTerminal([box("0 tokens", 'Try "refactor <filepath>"'), rec()]);
    await expect(createVoice(terminal, tap).toggle("t")).resolves.toEqual({ recording: true });
    expect(typed).toEqual([" "]);
  });

  it("erases the typed space and fails when voice mode never starts", async () => {
    const { terminal, typed } = fakeTerminal([idle]);
    await expect(createVoice(terminal, tap).toggle("t")).rejects.toThrow(VOICE_OFF_ERROR);
    expect(typed).toEqual([" ", "\x7f"]);
  });

  it("ignores a REC mark that only appears in the conversation", async () => {
    const { terminal } = fakeTerminal([{ lines: ["⏺ REC 표시 설명", "a", "b", RULE, "❯ ", RULE] }]);
    await expect(createVoice(terminal, tap).read("t")).resolves.toEqual({ recording: false, transcript: "" });
  });
});

describe("voice in hold mode", () => {
  it("keeps the key held while recording, then on the second press releases it, clears the prompt and returns the text", async () => {
    const { terminal, typed, show } = liveTerminal(idle);
    const voice = createVoice(terminal, { ...hold, sleep: realSleep, repeatMs: 5, pollMs: 20, settleMs: 40 });
    const started = voice.toggle("t");
    await realSleep(30);
    show(listening());
    await expect(started).resolves.toEqual({ recording: true });
    await realSleep(30);
    const held = spaces(typed);
    expect(held).toBeGreaterThan(2);
    await expect(voice.read("t")).resolves.toEqual({ recording: true, transcript: "" });
    show(box("", "테스트 돌려줘"));
    await expect(voice.toggle("t")).resolves.toEqual({ recording: false, transcript: "테스트 돌려줘" });
    const afterStop = spaces(typed);
    await realSleep(30);
    expect(spaces(typed)).toBe(afterStop);
    expect(typed.at(-1)).toBe("\x7f".repeat(Array.from("테스트 돌려줘").length + 4));
  });

  it("waits while Claude Code is still transcribing", async () => {
    const { terminal } = fakeTerminal([listening("고쳐"), box("transcribing…", "고쳐"), box("", "고쳐줘"), box("", "고쳐줘"), box("", "고쳐줘")]);
    await expect(createVoice(terminal, hold).toggle("t")).resolves.toEqual({ recording: false, transcript: "고쳐줘" });
  });

  it("returns nothing and types nothing when no speech was transcribed", async () => {
    const { terminal, typed } = fakeTerminal([listening(), box("No speech detected.", "")]);
    await expect(createVoice(terminal, hold).toggle("t")).resolves.toEqual({ recording: false, transcript: "" });
    expect(typed).toEqual([]);
  });

  it("does nothing on stop when nothing is held or recording", async () => {
    const { terminal, typed } = fakeTerminal([idle]);
    await expect(createVoice(terminal, hold).toggle("t", "stop")).resolves.toEqual({ recording: false, transcript: "" });
    expect(typed).toEqual([]);
  });

  it("starts over the empty-prompt suggestion", async () => {
    const { terminal, show } = liveTerminal(box("0 tokens", 'Try "refactor <filepath>"'));
    const voice = createVoice(terminal, { ...hold, sleep: realSleep, repeatMs: 5, pollMs: 10 });
    const started = voice.toggle("t");
    await realSleep(20);
    show(listening());
    await expect(started).resolves.toEqual({ recording: true });
    await voice.toggle("t", "stop");
  });

  it("starts even with a draft when Claude Code accepts it", async () => {
    const { terminal, show } = liveTerminal(box("", "쓰던 글"));
    const voice = createVoice(terminal, { ...hold, sleep: realSleep, repeatMs: 5, pollMs: 10 });
    const started = voice.toggle("t");
    await realSleep(20);
    show(listening("쓰던 글 "));
    await expect(started).resolves.toEqual({ recording: true });
    await voice.toggle("t", "stop");
  });

  it("releases and erases the repeated spaces when recording never starts", async () => {
    const { terminal, typed } = fakeTerminal([idle]);
    const voice = createVoice(terminal, { ...hold, sleep: realSleep, repeatMs: 5, pollMs: 20, startTimeoutMs: 60 });
    await expect(voice.toggle("t")).rejects.toThrow(VOICE_OFF_ERROR);
    const sent = spaces(typed);
    expect(typed.at(-1)).toBe("\x7f".repeat(sent));
    await realSleep(30);
    expect(spaces(typed)).toBe(sent);
  });

  it("lets go of the key when the dashboard stops checking in", async () => {
    const { terminal, typed, show } = liveTerminal(idle);
    const voice = createVoice(terminal, { ...hold, sleep: realSleep, repeatMs: 5, pollMs: 10, idleReleaseMs: 40 });
    const started = voice.toggle("t");
    await realSleep(15);
    show(listening());
    await started;
    await realSleep(80);
    const after = spaces(typed);
    await realSleep(30);
    expect(spaces(typed)).toBe(after);
  });
});

describe("readPrompt", () => {
  it("reads the prompt box text without the level meter", () => {
    const lines = ["  ⏺ REC · tap to send", RULE, "❯ 한 줄 입력 hello", "  둘째 줄▄", RULE, "  🧠 Opus"];
    expect(readPrompt(lines)).toBe("한 줄 입력 hello\n둘째 줄");
  });

  it("returns an empty string for an empty prompt with only the meter", () => {
    expect(readPrompt([RULE, "❯ ▁", RULE])).toBe("");
  });
});

describe("read", () => {
  it("returns the live transcript while recording", async () => {
    const { terminal } = fakeTerminal([rec("because of")]);
    await expect(createVoice(terminal).read("t")).resolves.toEqual({ recording: true, transcript: "because of" });
  });

  it("returns no transcript when not recording", async () => {
    const { terminal } = fakeTerminal([box("", "typed")]);
    await expect(createVoice(terminal).read("t")).resolves.toEqual({ recording: false, transcript: "" });
  });
});
