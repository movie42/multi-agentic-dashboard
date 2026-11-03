import type { PermissionAnswer } from "@/lib/permissions/types";

export type ActionRequest =
  | { type: "open-artifact"; target: string; via: "system" | "orca"; worktreePath: string }
  | { type: "focus-terminal"; terminalHandle: string }
  | { type: "close-terminal"; terminalHandle: string }
  | { type: "resume-session"; sessionId: string; cwd: string; title: string }
  | { type: "send-prompt"; terminalHandle: string; text: string }
  | { type: "choose-option"; terminalHandle: string; option: number }
  | { type: "launch-agent"; worktreePath: string; prompt: string }
  | { type: "open-terminal"; worktreePath: string }
  | { type: "check-feature"; featureId: string }
  | { type: "answer-permission"; requestId: string; answer: PermissionAnswer };

export type ActionResponse = { ok: true } | { ok: false; error: string };

export type AttachmentResponse = { ok: true; path: string } | { ok: false; error: string };
