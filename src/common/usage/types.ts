export interface UsageWindow {
  percent: number;
  resetsAt: string | null;
}

export interface UsageSnapshot {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  receivedAt: number;
  source: "statusline" | "api";
}

export type UsageResponse = ({ ok: true } & UsageSnapshot) | { ok: false; error: string };
