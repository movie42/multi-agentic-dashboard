import "server-only";

export interface VoiceTerminal {
  screen(handle: string): Promise<string[]>;
  type(handle: string, text: string): Promise<void>;
}

export type VoiceMode = "hold" | "tap";
export type VoiceIntent = "toggle" | "stop";
export type VoiceToggleResult = { recording: true } | { recording: false; transcript: string };

export interface VoiceOptions {
  mode?: () => Promise<VoiceMode>;
  startTimeoutMs?: number;
  settleMs?: number;
  stopTimeoutMs?: number;
  pollMs?: number;
  repeatMs?: number;
  idleReleaseMs?: number;
  maxHoldMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const VOICE_KEY = " ";
const BACKSPACE = "\x7f";
const ESCAPE = "\x1b";
const RECORDING_MARKS = ["⏺ REC", "listening…", "listening..."];
const BUSY_MARKS = [...RECORDING_MARKS, "transcribing"];
const CLEAR_SLACK = 4;

export const VOICE_DRAFT_ERROR = "터미널 입력창에 쓰던 글이 있어서 음성을 켤 수 없어요. 입력창을 비우고 다시 눌러 주세요.";
export const VOICE_OFF_ERROR = "이 세션은 음성 모드가 꺼져 있어요. 터미널에서 /voice로 켠 뒤 다시 눌러 주세요.";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const RULE = /^─{10,}$/;
const PROMPT_MARK = /^❯\s?/;
const LEVEL_METER = /[▁▂▃▄▅▆▇█]+$/;
const PLACEHOLDER = /^Try "[^"\n]*"$/;

interface PromptBox {
  status: string;
  text: string;
}

export function readPromptBox(lines: string[]): PromptBox | null {
  const normalized = lines.map((line) => line.replace(/ /g, " ").trimEnd());
  const promptIndex = normalized.findLastIndex((line) => PROMPT_MARK.test(line));
  if (promptIndex < 0) return null;
  const [first = "", ...rest] = normalized.slice(promptIndex);
  const ruleIndex = rest.findIndex((line) => RULE.test(line.trim()));
  const continuation = (ruleIndex < 0 ? rest : rest.slice(0, ruleIndex)).map((line) => line.replace(/^ {2}/, ""));
  const text = [first.replace(PROMPT_MARK, ""), ...continuation].join("\n").replace(LEVEL_METER, "").trim();
  const above = promptIndex > 0 && RULE.test(normalized[promptIndex - 1]?.trim() ?? "") ? promptIndex - 2 : promptIndex - 1;
  return { status: normalized[above] ?? "", text: PLACEHOLDER.test(text) ? "" : text };
}

const statusShows = (lines: string[], marks: string[]) => {
  const status = readPromptBox(lines)?.status ?? "";
  return marks.some((mark) => status.includes(mark));
};

export function isRecording(lines: string[]): boolean {
  return statusShows(lines, RECORDING_MARKS);
}

export function readPrompt(lines: string[]): string {
  return readPromptBox(lines)?.text ?? "";
}

interface Hold {
  timer: ReturnType<typeof setInterval>;
  sent: number;
  startedAt: number;
  lastSeen: number;
}

export function createVoice(terminal: VoiceTerminal, options: VoiceOptions = {}) {
  const {
    mode = async () => "hold" as const,
    startTimeoutMs = 2000,
    settleMs = 1000,
    stopTimeoutMs = 10_000,
    pollMs = 150,
    repeatMs = 40,
    idleReleaseMs = 3000,
    maxHoldMs = 180_000,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const holds = new Map<string, Hold>();
  const settleReads = Math.max(1, Math.ceil(settleMs / pollMs));
  const maxReads = Math.max(1, Math.ceil(stopTimeoutMs / pollMs));

  const release = (handle: string) => {
    const hold = holds.get(handle);
    if (!hold) return null;
    clearInterval(hold.timer);
    holds.delete(handle);
    return hold;
  };

  const press = (handle: string) => {
    const startedAt = now();
    const hold: Hold = {
      sent: 0,
      startedAt,
      lastSeen: startedAt,
      timer: setInterval(() => {
        const current = now();
        if (current - hold.lastSeen > idleReleaseMs || current - hold.startedAt > maxHoldMs) {
          console.warn("[voice] releasing an unattended hold", handle);
          release(handle);
          return;
        }
        hold.sent += 1;
        terminal.type(handle, VOICE_KEY).catch((error: unknown) => {
          console.warn("[voice] key repeat failed", error);
          release(handle);
        });
      }, repeatMs),
    };
    holds.set(handle, hold);
    return hold;
  };

  const waitForRecording = async (handle: string): Promise<boolean> => {
    const poll = async (left: number): Promise<boolean> => {
      if (isRecording(await terminal.screen(handle))) return true;
      if (left <= 1) return false;
      await sleep(pollMs);
      return poll(left - 1);
    };
    return poll(Math.floor(startTimeoutMs / pollMs) + 1);
  };

  const settleTap = async (handle: string, first: string): Promise<VoiceToggleResult> => {
    const settle = async (last: string, steady: number, reads: number): Promise<{ transcript: string; recording: boolean }> => {
      await sleep(pollMs);
      const lines = await terminal.screen(handle);
      if (!isRecording(lines)) return { transcript: last, recording: false };
      const current = readPrompt(lines);
      const nextSteady = current === last ? steady + 1 : 0;
      if (nextSteady >= settleReads || reads + 1 >= maxReads) return { transcript: current, recording: true };
      return settle(current, nextSteady, reads + 1);
    };
    const settled = await settle(first, 0, 0);
    if (settled.recording) await terminal.type(handle, ESCAPE);
    return { recording: false, transcript: settled.transcript };
  };

  const settleHold = async (handle: string): Promise<VoiceToggleResult> => {
    const settle = async (last: string | null, steady: number, reads: number): Promise<string> => {
      await sleep(pollMs);
      const lines = await terminal.screen(handle);
      const current = readPrompt(lines);
      const busy = statusShows(lines, BUSY_MARKS);
      const nextSteady = !busy && current === last ? steady + 1 : 0;
      if (nextSteady >= settleReads) return current;
      if (reads + 1 >= maxReads) return busy ? "" : current;
      return settle(current, nextSteady, reads + 1);
    };
    const transcript = await settle(null, 0, 0);
    if (transcript) await terminal.type(handle, BACKSPACE.repeat(Array.from(transcript).length + CLEAR_SLACK));
    return { recording: false, transcript };
  };

  const failure = (before: string[]) => new Error(readPrompt(before) ? VOICE_DRAFT_ERROR : VOICE_OFF_ERROR);

  const startHold = async (handle: string, before: string[]): Promise<VoiceToggleResult> => {
    const hold = press(handle);
    if (await waitForRecording(handle)) return { recording: true };
    release(handle);
    if (hold.sent > 0) await terminal.type(handle, BACKSPACE.repeat(hold.sent));
    throw failure(before);
  };

  const startTap = async (handle: string, before: string[]): Promise<VoiceToggleResult> => {
    await terminal.type(handle, VOICE_KEY);
    if (await waitForRecording(handle)) return { recording: true };
    await terminal.type(handle, BACKSPACE);
    throw failure(before);
  };

  return {
    async toggle(handle: string, intent: VoiceIntent = "toggle"): Promise<VoiceToggleResult> {
      const before = await terminal.screen(handle);
      if (release(handle)) return settleHold(handle);
      const voiceMode = await mode();
      if (isRecording(before)) return voiceMode === "tap" ? settleTap(handle, readPrompt(before)) : settleHold(handle);
      if (intent === "stop") return { recording: false, transcript: "" };
      return voiceMode === "tap" ? startTap(handle, before) : startHold(handle, before);
    },
    async read(handle: string): Promise<{ recording: boolean; transcript: string }> {
      const hold = holds.get(handle);
      if (hold) hold.lastSeen = now();
      const lines = await terminal.screen(handle);
      const recording = isRecording(lines) || Boolean(hold);
      return { recording, transcript: recording ? readPrompt(lines) : "" };
    },
  };
}
