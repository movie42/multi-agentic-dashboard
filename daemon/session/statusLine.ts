import type { RunnerUsage, RunnerUsageWindow } from "../../src/common/runner/types.ts";

export interface StatusLineReport {
  model: string | null;
  contextPercent: number | null;
  usage: Omit<RunnerUsage, "receivedAt"> | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resetTime(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  const seconds = finite(value);
  if (seconds === null) return null;
  return new Date(seconds < 1e12 ? seconds * 1000 : seconds).toISOString();
}

function windowOf(value: unknown): RunnerUsageWindow | null {
  const raw = record(value);
  const percent = finite(raw?.used_percentage) ?? finite(raw?.utilization);
  if (!raw || percent === null) return null;
  return { percent: Math.round(percent), resetsAt: resetTime(raw.resets_at) };
}

function modelOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  const raw = record(value);
  const name = raw?.display_name ?? raw?.id;
  return typeof name === "string" && name.trim() ? name : null;
}

function contextOf(value: unknown): number | null {
  const raw = record(value);
  if (!raw) return null;
  const used = finite(raw.used_percentage);
  if (used !== null) return Math.round(used);
  const size = finite(raw.context_window_size);
  const current = record(raw.current_usage);
  if (!size || !current) return null;
  const tokens = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
    .map((key) => finite(current[key]) ?? 0)
    .reduce((total, part) => total + part, 0);
  return Math.round((tokens / size) * 100);
}

export function parseStatusLine(body: unknown): StatusLineReport | null {
  const raw = record(body);
  if (!raw) return null;
  const limits = record(raw.rate_limits);
  const session = windowOf(limits?.five_hour);
  const weekly = windowOf(limits?.seven_day);
  return {
    model: modelOf(raw.model),
    contextPercent: contextOf(raw.context_window),
    usage: session || weekly ? { session, weekly } : null,
  };
}
