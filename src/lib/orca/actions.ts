export type ActionRequest =
  | { type: "open-artifact"; target: string; via: "system" | "orca"; worktreePath: string }
  | { type: "focus-terminal"; terminalHandle: string }
  | { type: "resume-session"; sessionId: string; cwd: string; title: string }
  | { type: "send-prompt"; terminalHandle: string; text: string }
  | { type: "choose-option"; terminalHandle: string; option: number }
  | { type: "launch-agent"; worktreePath: string; prompt: string };

export type ActionResponse = { ok: true } | { ok: false; error: string };
