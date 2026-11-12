"use client";

import { useQuery } from "@tanstack/react-query";
import type { UsageWindow } from "@/common/usage/types";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { usageQueryOptions } from "../api/usageQuery";

const SEGMENT_PERCENT = 5;
const SEGMENTS = Array.from({ length: 100 / SEGMENT_PERCENT }, (_, index) => index);

function barTone(percent: number): string {
  if (percent >= 90) return "bg-accent";
  if (percent >= 70) return "bg-ask";
  return "bg-fg";
}

function textTone(percent: number): string {
  if (percent >= 90) return "text-accent";
  if (percent >= 70) return "text-ask";
  return "text-fg";
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
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-semibold">{label}</span>
        <span className={`font-semibold tabular-nums ${window ? textTone(percent) : "text-muted"}`}>
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
              segment * SEGMENT_PERCENT < percent ? barTone(percent) : "bg-tint-2"
            }`}
          />
        ))}
      </div>
      {window?.resetsAt && <p className="mt-1 text-[11px] text-muted">{formatReset(window.resetsAt, now)}</p>}
    </div>
  );
}

export function UsageMeter() {
  const usage = useQuery(usageQueryOptions());
  if (usage.isPending) return <p className="text-[12px] text-muted">사용량 확인 중…</p>;
  if (usage.isError) {
    return <p className="text-[12px] text-muted">{`사용량을 못 읽었어요 · ${errorMessage(usage.error)}`}</p>;
  }
  const { session, weekly, fetchedAt } = usage.data;
  return (
    <div className="flex flex-col gap-3">
      <UsageRow label="현재 세션 (5시간)" window={session} now={fetchedAt} />
      <UsageRow label="주간 (7일)" window={weekly} now={fetchedAt} />
    </div>
  );
}
