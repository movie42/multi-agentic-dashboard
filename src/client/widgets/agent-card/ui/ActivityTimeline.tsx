"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ActivityStep, ToolStatus } from "@/common/sessions/types";
import { activityQueryOptions } from "@/client/entities/session";
import { formatClock } from "@/client/shared/lib/format";
import { StatusLine } from "@/client/shared/ui/StatusLine";

const STICK_PX = 48;

const STATUS_DOT: Record<ToolStatus, string> = {
  running: "bg-now animate-pulse",
  ok: "bg-done",
  error: "bg-accent",
  stopped: "bg-faint",
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: "진행 중",
  ok: "완료",
  error: "오류",
  stopped: "중단됨",
};

interface StepRowProps {
  step: ActivityStep;
}

function StepRow({ step }: StepRowProps) {
  const clock = step.at ? formatClock(step.at) : null;
  if (step.kind === "tool") {
    return (
      <li className="flex shrink-0 items-baseline gap-2 text-[12px]" title={step.detail ?? undefined}>
        <span className={`size-2 shrink-0 translate-y-[-1px] rounded-full ${STATUS_DOT[step.status]}`} title={STATUS_LABEL[step.status]} />
        <span className="shrink-0 font-mono font-semibold">{step.name}</span>
        <span className={`min-w-0 flex-1 truncate font-mono ${step.status === "running" ? "text-fg" : "text-muted"}`}>
          {step.summary}
        </span>
        {clock && <span className="shrink-0 text-faint tabular-nums">{clock}</span>}
      </li>
    );
  }
  if (step.kind === "prompt") {
    return (
      <li className="shrink-0 rounded-lg bg-tint px-3 py-2 text-[13px] leading-relaxed">
        <span className="mr-2 text-[11px] font-semibold text-muted">사용자</span>
        <span className="line-clamp-3 whitespace-pre-wrap">{step.text}</span>
      </li>
    );
  }
  return <li className="line-clamp-3 shrink-0 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{step.text}</li>;
}

interface ActivityListProps {
  sessionId: string;
}

function ActivityList({ sessionId }: ActivityListProps) {
  const activity = useQuery(activityQueryOptions(sessionId));
  const steps = activity.data ?? null;
  const listRef = useRef<HTMLOListElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [steps]);

  const onScroll = (event: React.UIEvent<HTMLOListElement>) => {
    const list = event.currentTarget;
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_PX;
  };

  if (activity.error)
    return (
      <div className="mt-2">
        <StatusLine error={activity.error} label="진행 기록을 읽지 못했어요" />
      </div>
    );
  if (!steps) return <p className="mt-2 text-[12px] text-muted">불러오는 중…</p>;
  if (steps.length === 0) return <p className="mt-2 text-[12px] text-muted">아직 기록이 없어요</p>;

  return (
    <ol
      ref={listRef}
      onScroll={onScroll}
      className="mt-2 flex max-h-[24rem] flex-col gap-2 overflow-y-auto border-l-2 border-hair pl-3"
    >
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </ol>
  );
}

interface ActivityTimelineProps {
  sessionId: string;
}

export function ActivityTimeline({ sessionId }: ActivityTimelineProps) {
  const [open, setOpen] = useState(false);

  return (
    <details className="group" onToggle={(event: React.SyntheticEvent<HTMLDetailsElement>) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer list-none text-[13px] text-muted hover:text-fg">
        <span className="group-open:hidden">진행 기록 보기 ▾</span>
        <span className="hidden group-open:inline">진행 기록 접기 ▴</span>
      </summary>
      {open && <ActivityList sessionId={sessionId} />}
    </details>
  );
}
