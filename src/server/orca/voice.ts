import "server-only";

export interface VoiceTerminal {
  readTerminal(handle: string): Promise<{ lines: string[]; draft: string }>;
  type(handle: string, text: string): Promise<void>;
}

export interface VoiceToggleOptions {
  startTimeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const VOICE_KEY = " ";
const BACKSPACE = "\x7f";
const RECORDING_MARK = "⏺ REC";

export const VOICE_DRAFT_ERROR = "터미널 입력창에 쓰던 글이 있어서 음성을 켤 수 없어요. 입력창을 비우고 다시 눌러 주세요.";
export const VOICE_OFF_ERROR = "이 세션은 음성 모드가 꺼져 있어요. 터미널에서 /voice로 켠 뒤 다시 눌러 주세요.";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const RULE = /^─{10,}$/;
const PROMPT_MARK = /^❯\s?/;
const LEVEL_METER = /[▁▂▃▄▅▆▇█]+$/;

export function isRecording(lines: string[]): boolean {
  return lines.some((line) => line.includes(RECORDING_MARK));
}

export function readPrompt(lines: string[]): string {
  const normalized = lines.map((line) => line.replace(/\u00a0/g, " ").trimEnd());
  const promptIndex = normalized.findLastIndex((line) => PROMPT_MARK.test(line));
  if (promptIndex < 0) return "";
  const [first = "", ...rest] = normalized.slice(promptIndex);
  const ruleIndex = rest.findIndex((line) => RULE.test(line.trim()));
  const continuation = (ruleIndex < 0 ? rest : rest.slice(0, ruleIndex)).map((line) => line.replace(/^ {2}/, ""));
  return [first.replace(PROMPT_MARK, ""), ...continuation].join("\n").replace(LEVEL_METER, "").trim();
}

const squash = (text: string) => text.replace(/\s+/g, "");

function holdsDraft({ lines, draft }: { lines: string[]; draft: string }): boolean {
  const typed = squash(draft);
  return typed.length > 0 && squash(readPrompt(lines)) === typed;
}

export async function readVoice(terminal: VoiceTerminal, handle: string): Promise<{ recording: boolean; transcript: string }> {
  const { lines } = await terminal.readTerminal(handle);
  const recording = isRecording(lines);
  return { recording, transcript: recording ? readPrompt(lines) : "" };
}

export async function toggleVoice(terminal: VoiceTerminal, handle: string, options: VoiceToggleOptions = {}): Promise<boolean> {
  const { startTimeoutMs = 1500, pollMs = 150, sleep = defaultSleep } = options;
  const before = await terminal.readTerminal(handle);
  if (isRecording(before.lines)) {
    await terminal.type(handle, VOICE_KEY);
    return false;
  }
  if (holdsDraft(before)) throw new Error(VOICE_DRAFT_ERROR);

  await terminal.type(handle, VOICE_KEY);
  const waitForRecording = async (attemptsLeft: number): Promise<boolean> => {
    if (isRecording((await terminal.readTerminal(handle)).lines)) return true;
    if (attemptsLeft <= 1) return false;
    await sleep(pollMs);
    return waitForRecording(attemptsLeft - 1);
  };
  if (await waitForRecording(Math.floor(startTimeoutMs / pollMs) + 1)) return true;
  await terminal.type(handle, BACKSPACE);
  throw new Error(VOICE_OFF_ERROR);
}
