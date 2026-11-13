"use client";

import { useQuery } from "@tanstack/react-query";
import { isValidElement, useEffect, useRef } from "react";
import type { ActivityStep, ToolStatus } from "@/common/sessions/types";
import { chatQueryOptions } from "@/client/entities/session";
import { formatClock } from "@/client/shared/lib/format";
import { Markdown } from "@/client/shared/ui/Markdown";
import { StatusLine } from "@/client/shared/ui/StatusLine";
import { SlackCopyButton } from "./SlackCopyButton";

const STICK_PX = 64;

const STATUS_DOT: Record<ToolStatus, string> = {
  running: "text-now animate-pulse",
  ok: "text-done",
  error: "text-accent",
  stopped: "text-faint",
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: "진행 중",
  ok: "완료",
  error: "오류",
  stopped: "중단됨",
};

type ToolStep = Extract<ActivityStep, { kind: "tool" }>;

interface ToolRowProps {
  step: ToolStep;
}

function ToolRow({ step }: ToolRowProps) {
  const line = (
    <>
      <span className={`shrink-0 ${STATUS_DOT[step.status]}`} title={STATUS_LABEL[step.status]}>
        ●
      </span>
      <span className="shrink-0 font-semibold">{step.name}</span>
      <span className={`min-w-0 flex-1 truncate ${step.status === "running" ? "text-fg" : "text-muted"}`}>{step.summary}</span>
      {step.at && <span className="shrink-0 text-faint tabular-nums">{formatClock(step.at)}</span>}
    </>
  );
  if (!step.detail) return <li className="flex items-baseline gap-2 px-2 py-0.5 font-mono text-[12px]">{line}</li>;
  return (
    <li>
      <details className="group/tool">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-md px-2 py-0.5 font-mono text-[12px] hover:bg-tint-2">
          {line}
        </summary>
        <pre className="mx-2 mt-1 mb-2 max-h-72 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
          {step.detail}
        </pre>
      </details>
    </li>
  );
}

interface TextRowProps {
  text: string;
  copyable: boolean;
}

function TextRow({ text, copyable }: TextRowProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <li className="flex flex-col gap-1.5 py-1">
      <div ref={bodyRef}>
        <Markdown text={text} />
      </div>
      {copyable && <SlackCopyButton source={bodyRef} plainText={text} />}
    </li>
  );
}

interface ChatRowProps {
  step: ActivityStep;
  copyable: boolean;
}

function ChatRow({ step, copyable }: ChatRowProps) {
  if (step.kind === "tool") return <ToolRow step={step} />;
  if (step.kind === "prompt") {
    return (
      <li className="flex justify-end py-1">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-tint-2 px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap">
          {step.text}
        </p>
      </li>
    );
  }
  return <TextRow text={step.text} copyable={copyable} />;
}

interface ChatViewProps {
  sessionId: string;
  working: boolean;
  footer?: React.ReactNode;
}

export function ChatView({ sessionId, working, footer }: ChatViewProps) {
  const chat = useQuery(chatQueryOptions(sessionId));
  const steps = chat.data ?? null;
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastTextId = steps?.findLast((step) => step.kind === "text")?.id ?? null;

  const footerKey = isValidElement(footer) ? footer.key : null;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !stickRef.current) return;
    const bottom = list.scrollHeight - list.clientHeight;
    if (Math.abs(list.scrollTop - bottom) > 1) list.scrollTop = bottom;
  }, [steps, footerKey, working]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_PX;
  };

  if (chat.error) return <StatusLine error={chat.error} label="대화를 읽지 못했어요" />;
  if (!steps) return <p className="text-[12px] text-muted">불러오는 중…</p>;

  return (
    <div ref={listRef} onScroll={onScroll} data-chat className="flex max-h-[36rem] min-h-24 flex-col gap-2 overflow-y-auto pr-1">
      {steps.length === 0 ? (
        <p className="text-[13px] text-muted">아직 대화가 없어요</p>
      ) : (
        <ol className="flex flex-col gap-0.5">
          {steps.map((step) => (
            <ChatRow key={step.id} step={step} copyable={!working && step.id === lastTextId} />
          ))}
        </ol>
      )}
      {working && (
        <p className="flex items-center gap-1.5 px-2 text-[12px] text-now">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          작업 중
        </p>
      )}
      {footer}
    </div>
  );
}
