export interface UsageWindow {
  percent: number;
  resetsAt: string | null;
}

export interface UsageSnapshot {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  fetchedAt: number;
}

export type UsageResponse = ({ ok: true } & UsageSnapshot) | { ok: false; error: string };
