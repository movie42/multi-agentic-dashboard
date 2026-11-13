"use client";

import { useQuery } from "@tanstack/react-query";
import type { UsageWindow } from "@/common/usage/types";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { usageQueryOptions } from "../api/usageQuery";

const SEGMENT_PERCENT = 5;
const SEGMENTS = Array.from({ length: 100 / SEGMENT_PERCENT }, (_, index) => index);

const TONES = {
  low: { bar: "bg-done", text: "text-done" },
  mid: { bar: "bg-ask", text: "text-ask" },
  high: { bar: "bg-accent", text: "text-accent" },
} as const;

function usageTone(percent: number) {
  if (percent >= 80) return TONES.high;
  if (percent >= 50) return TONES.mid;
  return TONES.low;
}

export function formatReset(resetsAt: string | null, now: number): string {
  if (!resetsAt) return "";
  const at = new Date(resetsAt).getTime();
  const minutes = Math.max(0, Math.round((at - now) / 60_000));
  if (minutes < 60) return `${minutes}분 뒤 초기화`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 ${minutes % 60}분 뒤 초기화`;
  const date = new Date(at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} 초기화`;
}

interface UsageRowProps {
  label: string;
  window: UsageWindow | null;
  now: number;
}

function UsageRow({ label, window, now }: UsageRowProps) {
  const percent = window ? Math.min(100, Math.max(0, window.percent)) : 0;
  const tone = usageTone(percent);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold">{label}</span>
        <span className={`font-semibold tabular-nums ${window ? tone.text : "text-muted"}`}>
          {window ? `${percent}%` : "—"}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1 grid grid-cols-20 gap-px"
      >
        {SEGMENTS.map((segment) => (
          <span
            key={segment}
            className={`h-1.5 first:rounded-l-full last:rounded-r-full ${
              segment * SEGMENT_PERCENT < percent ? tone.bar : "bg-tint-2"
            }`}
          />
        ))}
      </div>
      {window?.resetsAt && <p className="mt-1 text-[11px] text-muted">{formatReset(window.resetsAt, now)}</p>}
    </div>
  );
}

const SOURCE_HINTS = {
  statusline: "대시보드가 띄운 Claude 세션의 상태줄에서 받은 값이에요",
  api: "띄운 세션의 최근 값이 없어 Anthropic 사용량 API에서 받은 값이에요",
} as const;

export function formatReceived(receivedAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - receivedAt) / 60_000));
  if (minutes < 1) return "방금 받은 값";
  if (minutes < 60) return `${minutes}분 전 기준`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 기준`;
  return `${Math.floor(hours / 24)}일 전 기준`;
}

export function UsageMeter() {
  const usage = useQuery(usageQueryOptions());
  if (usage.isPending) return <p className="text-[12px] text-muted">사용량 확인 중…</p>;
  if (usage.isError) {
    return <p className="text-[12px] text-muted">{`사용량을 못 읽었어요 · ${errorMessage(usage.error)}`}</p>;
  }
  const { session, weekly, receivedAt, source } = usage.data;
  const now = usage.dataUpdatedAt;
  return (
    <div className="flex flex-col gap-3">
      <UsageRow label="현재 세션 (5시간)" window={session} now={now} />
      <UsageRow label="주간 (7일)" window={weekly} now={now} />
      <p className="text-[11px] text-faint" title={SOURCE_HINTS[source]}>
        {formatReceived(receivedAt, now)}
      </p>
    </div>
  );
}
