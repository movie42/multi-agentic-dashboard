export type TitleSource = "custom" | "ai" | "none";

export type SessionOrigin = "human" | "headless" | "spawned";

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
}

export type SessionsResponse =
  | { ok: true; sessions: SessionSummary[]; scannedAt: number }
  | { ok: false; error: string };
