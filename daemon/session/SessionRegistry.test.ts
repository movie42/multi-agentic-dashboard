import { describe, expect, it, vi } from "vitest";
import { asksForTrust, SessionRegistry, trimChunks, type PtyProcess, type SpawnPty } from "./SessionRegistry.ts";

interface FakePty extends PtyProcess {
  emitData(data: string): void;
  emitExit(exitCode: number): void;
  written: string[];
  killed: boolean;
}

function fakePty(): FakePty {
  let onData: (data: string) => void = () => {};
  let onExit: (event: { exitCode: number }) => void = () => {};
  const pty: FakePty = {
    written: [],
    killed: false,
    onData: (listener) => {
      onData = listener;
    },
    onExit: (listener) => {
      onExit = listener;
    },
    write: (data) => {
      pty.written.push(data);
    },
    resize: () => {},
    kill: () => {
      pty.killed = true;
    },
    emitData: (data) => onData(data),
    emitExit: (exitCode) => onExit({ exitCode }),
  };
  return pty;
}

function setup(scrollbackLimit = 1024) {
  const ptys: FakePty[] = [];
  const spawn = vi.fn<SpawnPty>(() => {
    const pty = fakePty();
    ptys.push(pty);
    return pty;
  });
  const onChange = vi.fn();
  let id = 0;
  const registry = new SessionRegistry({
    spawn,
    commandFor: ({ id: sessionId, kind, prompt, resumeSessionId }) =>
      kind === "shell"
        ? { file: "zsh", args: [] }
        : { file: "claude", args: [...(resumeSessionId ? ["--resume", resumeSessionId] : ["--session-id", sessionId]), ...(prompt ? [prompt] : [])] },
    env: { TERM: "xterm-256color" },
    now: () => 1000,
    newId: () => `s${++id}`,
    scrollbackLimit,
    onChange,
  });
  return { registry, spawn, ptys, onChange };
}

describe("SessionRegistry", () => {
  it("spawns the command in the given folder with this session's arguments", () => {
    const { registry, spawn } = setup();
    const session = registry.launch({ cwd: "/repo" });
    expect(session).toMatchObject({ id: "s1", cwd: "/repo", kind: "claude", status: "idle", prompted: false, exitCode: null });
    expect(spawn).toHaveBeenCalledWith("claude", ["--session-id", "s1"], expect.objectContaining({ cwd: "/repo" }));
  });

  it("starts working when launched with a first prompt", () => {
    const { registry, spawn } = setup();
    const session = registry.launch({ cwd: "/repo", prompt: "fix the bug" });
    expect(session).toMatchObject({ status: "working", prompted: true });
    expect(spawn).toHaveBeenCalledWith("claude", ["--session-id", "s1", "fix the bug"], expect.anything());
  });

  it("resumes under the resumed session's own id, and does not start it twice", () => {
    const { registry, spawn, ptys } = setup();
    const session = registry.launch({ cwd: "/repo", resumeSessionId: "old-1" });
    expect(session).toMatchObject({ id: "old-1", prompted: true, status: "idle" });
    expect(spawn).toHaveBeenCalledWith("claude", ["--resume", "old-1"], expect.anything());
    expect(registry.launch({ cwd: "/repo", resumeSessionId: "old-1" })).toBe(session);
    expect(spawn).toHaveBeenCalledTimes(1);
    ptys[0]?.emitExit(0);
    registry.launch({ cwd: "/repo", resumeSessionId: "old-1" });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(registry.get("old-1")?.status).toBe("idle");
    ptys[0]?.emitExit(1);
    expect(registry.get("old-1")?.status).toBe("idle");
  });

  it("opens a plain shell that ignores prompt and resume", () => {
    const { registry, spawn } = setup();
    const session = registry.launch({ cwd: "/repo", kind: "shell", prompt: "ls", resumeSessionId: "old-1" });
    expect(session).toMatchObject({ id: "s1", kind: "shell", prompted: false });
    expect(spawn).toHaveBeenCalledWith("zsh", [], expect.anything());
  });

  it("remembers that the session has received a prompt", () => {
    const { registry } = setup();
    registry.launch({ cwd: "/repo" });
    registry.signal("s1", { event: "UserPromptSubmit" });
    registry.signal("s1", { event: "Stop" });
    expect(registry.get("s1")).toMatchObject({ status: "idle", prompted: true });
  });

  it("waits on the user while Claude asks whether to trust the folder, then goes on once hooks start", () => {
    const { registry, ptys } = setup();
    registry.launch({ cwd: "/new", prompt: "go" });
    ptys[0]?.emitData("\x1b[1mYes, I trust\x1b[0m ");
    ptys[0]?.emitData("this folder");
    expect(registry.get("s1")?.status).toBe("waiting");
    registry.signal("s1", { event: "SessionStart" });
    expect(registry.get("s1")?.status).toBe("idle");
    registry.signal("s1", { event: "UserPromptSubmit" });
    expect(registry.get("s1")?.status).toBe("working");
    ptys[0]?.emitData("the reply says: trust this folder");
    expect(registry.get("s1")?.status).toBe("working");
  });

  it("recognises the trust question through terminal control codes", () => {
    expect(asksForTrust("\x1b[2K\x1b[1G ❯ Yes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder")).toBe(true);
    expect(asksForTrust("hello")).toBe(false);
  });

  it("replays earlier output to a late attacher and streams new output", () => {
    const { registry, ptys } = setup();
    registry.launch({ cwd: "/repo" });
    ptys[0]?.emitData("hello ");
    const output = vi.fn();
    const attachment = registry.attach("s1", { output, exit: vi.fn() });
    expect(attachment?.scrollback).toBe("hello ");
    ptys[0]?.emitData("world");
    expect(output).toHaveBeenCalledWith("world");
    attachment?.detach();
    ptys[0]?.emitData("!");
    expect(output).toHaveBeenCalledTimes(1);
  });

  it("keeps only the newest output within the scrollback limit", () => {
    expect(trimChunks(["aaaa", "bbbb", "cc"], 6)).toEqual(["bbbb", "cc"]);
    expect(trimChunks(["aaaa", "bbbb", "cc"], 4)).toEqual(["bb", "cc"]);
    expect(trimChunks(["abcdefgh"], 3)).toEqual(["fgh"]);
  });

  it("applies hook signals and reports each change", () => {
    const { registry, onChange } = setup();
    registry.launch({ cwd: "/repo" });
    registry.signal("s1", { event: "UserPromptSubmit" });
    expect(registry.get("s1")?.status).toBe("working");
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: "s1", status: "working" })]);
    expect(registry.signal("missing", { event: "Stop" })).toBe(false);
  });

  it("marks the session exited and tells attachers when the process ends", () => {
    const { registry, ptys } = setup();
    registry.launch({ cwd: "/repo" });
    const exit = vi.fn();
    registry.attach("s1", { output: vi.fn(), exit });
    ptys[0]?.emitExit(0);
    expect(registry.get("s1")).toMatchObject({ status: "exited", exitCode: 0 });
    expect(exit).toHaveBeenCalledWith(0);
    registry.write("s1", "ignored");
    expect(ptys[0]?.written).toEqual([]);
  });

  it("kills a live process on close and forgets the session", () => {
    const { registry, ptys } = setup();
    registry.launch({ cwd: "/repo" });
    expect(registry.close("s1")).toBe(true);
    expect(ptys[0]?.killed).toBe(true);
    expect(registry.list()).toEqual([]);
  });

  it("keeps the live screen of each session and returns its rows", async () => {
    const { registry, ptys } = setup();
    registry.launch({ cwd: "/repo" });
    ptys[0]?.emitData("first\r\n\u276f typed");
    const lines = await registry.screen("s1");
    expect(lines?.slice(0, 2)).toEqual(["first", "\u276f typed"]);
    await expect(registry.screen("missing")).resolves.toBeNull();
  });

  it("forgets an exited session after a while, but not one resumed under the same id", () => {
    vi.useFakeTimers();
    try {
      const { registry, ptys } = setup();
      registry.launch({ cwd: "/repo" });
      ptys[0]?.emitExit(0);
      registry.launch({ cwd: "/repo", resumeSessionId: "s1" });
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(registry.get("s1")?.status).not.toBe("exited");
      ptys[1]?.emitExit(0);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(registry.get("s1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps the model and context share from the status line and passes usage on", () => {
    const { registry, onChange } = setup();
    const onUsage = vi.fn();
    const withUsage = new SessionRegistry({
      spawn: () => fakePty(),
      commandFor: () => ({ file: "claude", args: [] }),
      env: {},
      now: () => 5000,
      newId: () => "u1",
      onUsage,
    });
    withUsage.launch({ cwd: "/repo" });
    const usage = { session: { percent: 10, resetsAt: null }, weekly: null };
    withUsage.report("u1", { model: "Opus 5.5", contextPercent: 30, usage });
    expect(withUsage.get("u1")).toMatchObject({ model: "Opus 5.5", contextPercent: 30 });
    expect(onUsage).toHaveBeenCalledWith({ ...usage, receivedAt: 5000 });

    registry.launch({ cwd: "/repo" });
    onChange.mockClear();
    registry.report("s1", { model: "Sonnet", contextPercent: null, usage: null });
    registry.report("s1", { model: "Sonnet", contextPercent: null, usage: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(registry.report("none", { model: null, contextPercent: null, usage: null })).toBe(false);
  });

  it("holds a permission request until the dashboard answers it", async () => {
    const { registry } = setup();
    registry.launch({ cwd: "/repo" });
    const pending = registry.holdPermission("s1", { toolName: "Bash", toolInput: { command: "ls" }, suggestions: [] });
    const permission = registry.get("s1")?.permission;
    expect(permission).toMatchObject({ toolName: "Bash", toolInput: { command: "ls" } });
    expect(registry.answerPermission("s1", "wrong", { behavior: "allow", suggestionIndex: null })).toBe(false);
    expect(registry.answerPermission("s1", permission?.id ?? "", { behavior: "allow", suggestionIndex: null })).toBe(true);
    await expect(pending).resolves.toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
    expect(registry.get("s1")?.permission).toBeNull();
  });

  it("keeps a held request while a parallel tool finishes, and lets go once the turn ends", async () => {
    const { registry } = setup();
    registry.launch({ cwd: "/repo" });
    const pending = registry.holdPermission("s1", { toolName: "Bash", toolInput: {}, suggestions: [] });
    registry.signal("s1", { event: "PostToolUse" });
    expect(registry.get("s1")?.permission).not.toBeNull();
    registry.signal("s1", { event: "Stop" });
    await expect(pending).resolves.toEqual({});
    expect(registry.get("s1")?.permission).toBeNull();
  });

  it("lets go of a held request when the hook stops waiting", async () => {
    const { registry } = setup();
    registry.launch({ cwd: "/repo" });
    const pending = registry.holdPermission("s1", { toolName: "Bash", toolInput: {}, suggestions: [] });
    registry.cancelPermission("s1", registry.get("s1")?.permission?.id ?? "");
    await expect(pending).resolves.toEqual({});
  });
});
