export type TitleSource = "custom" | "ai" | "none";

export type SessionOrigin = "human" | "headless" | "spawned";

export interface SessionBookmark {
  name: string;
  memo: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  titleSource: TitleSource;
  cwd: string | null;
  project: string | null;
  cwdExists: boolean;
  gitBranch: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  lastMessage: string | null;
  startedAt: number | null;
  updatedAt: number;
  sizeBytes: number;
  origin: SessionOrigin;
  bookmark: SessionBookmark | null;
}

export type SessionsResponse =
  | { ok: true; sessions: SessionSummary[]; scannedAt: number }
  | { ok: false; error: string };

export interface SessionRef {
  id: string;
  title: string | null;
  titleSource: TitleSource;
  bookmark: SessionBookmark | null;
}

export type ToolStatus = "running" | "ok" | "error" | "stopped";

export type ActivityStep =
  | { kind: "prompt"; id: string; at: number | null; text: string }
  | { kind: "text"; id: string; at: number | null; text: string }
  | { kind: "tool"; id: string; at: number | null; name: string; summary: string | null; detail: string | null; status: ToolStatus };

export type ActivityResponse =
  | { ok: true; steps: ActivityStep[]; updatedAt: number }
  | { ok: false; error: string };

export interface ConversationTurn {
  id: string;
  at: number | null;
  prompt: string;
  answer: string | null;
}

export type ConversationResponse =
  | { ok: true; turns: ConversationTurn[]; updatedAt: number }
  | { ok: false; error: string };
