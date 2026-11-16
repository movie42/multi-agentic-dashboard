import { describe, expect, it } from "vitest";
import { Dictation, DICTATION_ARGS } from "./Dictation.ts";
import type { PtyProcess } from "./SessionRegistry.ts";
import type { Screen } from "./screen.ts";

function fakePty() {
  const data: Array<(chunk: string) => void> = [];
  const exits: Array<(event: { exitCode: number }) => void> = [];
  const written: string[] = [];
  const pty: PtyProcess = {
    onData: (listener) => data.push(listener),
    onExit: (listener) => exits.push(listener),
    write: (chunk) => written.push(chunk),
    resize: () => {},
    kill: () => exits.forEach((listener) => listener({ exitCode: 0 })),
  };
  return { pty, written, emit: (chunk: string) => data.forEach((listener) => listener(chunk)), exit: () => exits.forEach((listener) => listener({ exitCode: 1 })) };
}

const CLEAR = "\x1b[2J";

function textScreen(): Screen {
  const state = { text: "" };
  return { write: (chunk) => (state.text = chunk.startsWith(CLEAR) ? chunk.slice(CLEAR.length) : state.text + chunk), resize: () => {}, lines: async () => state.text.split("\n"), dispose: () => {} };
}

function setup() {
  const spawned: Array<{ args: string[]; cwd: string; fake: ReturnType<typeof fakePty> }> = [];
  const clock = { now: 0 };
  const dictation = new Dictation({
    spawn: (_file, args, options) => {
      const fake = fakePty();
      spawned.push({ args, cwd: options.cwd, fake });
      return fake.pty;
    },
    claude: "claude",
    cwd: "/data/dictation",
    env: {},
    createScreen: textScreen,
    readyTimeoutMs: 1000,
    pollMs: 100,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
      const last = spawned.at(-1);
      if (clock.now === 200) last?.fake.emit("Quick safety check\n ❯ No, exit\n   Yes, I trust this folder\n");
      if (clock.now === 400) last?.fake.emit(`${CLEAR}Quick safety check\n   No, exit\n ❯ Yes, I trust this folder\n`);
      if (clock.now === 600) last?.fake.emit(`${CLEAR}\n❯ \n`);
    },
  });
  return { dictation, spawned };
}

describe("Dictation", () => {
  it("starts one hidden claude without tools, picks Yes in the folder trust prompt and resolves once the prompt box shows", async () => {
    const { dictation, spawned } = setup();
    await Promise.all([dictation.ensure(), dictation.ensure()]);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.args).toEqual(DICTATION_ARGS);
    expect(spawned[0]?.cwd).toBe("/data/dictation");
    expect(spawned[0]?.fake.written).toEqual(["\x1b[B", "\r"]);
    expect(await dictation.screen()).toContain("❯ ");
    expect(dictation.write(" ")).toBe(true);
    await dictation.ensure();
    expect(spawned).toHaveLength(1);
  });

  it("starts again after the process exits and refuses writes while none is running", async () => {
    const { dictation, spawned } = setup();
    expect(dictation.write(" ")).toBe(false);
    expect(await dictation.screen()).toBeNull();
    await dictation.ensure();
    spawned[0]?.fake.exit();
    expect(dictation.write(" ")).toBe(false);
    await expect(dictation.ensure()).rejects.toThrow("준비되지 않았어요");
    expect(spawned).toHaveLength(2);
  });
});
