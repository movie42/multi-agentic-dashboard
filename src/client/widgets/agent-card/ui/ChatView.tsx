"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { ActivityStep, ToolStatus } from "@/common/sessions/types";
import { chatQueryOptions } from "@/client/entities/session";
import { formatClock } from "@/client/shared/lib/format";
import { Markdown } from "@/client/shared/ui/Markdown";
import { StatusLine } from "@/client/shared/ui/StatusLine";
import { SlackCopyButton } from "./SlackCopyButton";
import { UiActionTarget, UiRow } from "./UiRow";

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
type QuestionStep = Extract<ActivityStep, { kind: "question" }>;
type PlanStep = Extract<ActivityStep, { kind: "plan" }>;
type AskedQuestion = QuestionStep["questions"][number];

const UNANSWERED_LABEL: Record<ToolStatus, string> = {
  running: "답을 기다리는 중",
  ok: "답 없음",
  error: "답하지 않고 넘어감",
  stopped: "답하지 않고 중단됨",
};

const PLAN_LABEL: Record<ToolStatus, string> = {
  running: "승인 대기",
  ok: "승인함",
  error: "거절함",
  stopped: "중단됨",
};

function pickedLabels(question: AskedQuestion, answer: string): Set<string> {
  const labels = question.options.map((option) => option.label);
  if (labels.includes(answer)) return new Set([answer]);
  return new Set(answer.split(", ").filter((part) => labels.includes(part)));
}

interface AskedQuestionViewProps {
  question: AskedQuestion;
  answer: string | null;
  status: ToolStatus;
}

function AskedQuestionView({ question, answer, status }: AskedQuestionViewProps) {
  const picked = answer === null ? new Set<string>() : pickedLabels(question, answer);
  const chosen = question.options.filter((option) => picked.has(option.label));
  const others = question.options.filter((option) => !picked.has(option.label));
  const typed = answer !== null && chosen.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
        {question.header && <span className="mr-1.5 rounded-full bg-tint-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{question.header}</span>}
        {question.question}
      </p>
      {answer === null ? (
        <p className={`text-[13px] ${status === "running" ? "text-now" : "text-muted"}`}>{UNANSWERED_LABEL[status]}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {typed ? (
            <li className="rounded-lg bg-tint-2 px-3 py-1.5 text-[14px] font-semibold whitespace-pre-wrap">
              <span className="mr-1.5 text-done">✓</span>
              {answer}
              <span className="ml-1.5 text-[12px] font-normal text-muted">직접 입력</span>
            </li>
          ) : (
            chosen.map((option) => (
              <li key={option.label} className="rounded-lg bg-tint-2 px-3 py-1.5">
                <p className="text-[14px] font-semibold">
                  <span className="mr-1.5 text-done">✓</span>
                  {option.label}
                </p>
                {option.description && <p className="text-[12px] leading-snug text-muted">{option.description}</p>}
              </li>
            ))
          )}
        </ul>
      )}
      {others.length > 0 && (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer list-none hover:text-fg">{answer === null ? `선택지 ${others.length}개` : `다른 선택지 ${others.length}개`}</summary>
          <ul className="mt-1 flex flex-col gap-1 pl-3">
            {others.map((option) => (
              <li key={option.label}>
                <span className="text-fg">{option.label}</span>
                {option.description && <span> — {option.description}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface QuestionRowProps {
  step: QuestionStep;
}

function QuestionRow({ step }: QuestionRowProps) {
  return (
    <li className="my-1 flex flex-col gap-3 rounded-xl px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--hair)]">
      <p className="flex items-baseline gap-2 font-mono text-[12px] text-muted">
        <span className="font-semibold text-fg">질문</span>
        {step.at && <span className="ml-auto text-faint tabular-nums">{formatClock(step.at)}</span>}
      </p>
      {step.questions.map((question) => (
        <AskedQuestionView
          key={question.question}
          question={question}
          answer={step.answers?.[question.question] ?? null}
          status={step.status}
        />
      ))}
    </li>
  );
}

interface PlanRowProps {
  step: PlanStep;
}

function PlanRow({ step }: PlanRowProps) {
  return (
    <li className="my-1 flex flex-col gap-2 rounded-xl px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--hair)]">
      <p className="flex items-baseline gap-2 font-mono text-[12px]">
        <span className="font-semibold">계획</span>
        <span className={STATUS_DOT[step.status]}>●</span>
        <span className="text-muted">{PLAN_LABEL[step.status]}</span>
        {step.at && <span className="ml-auto text-faint tabular-nums">{formatClock(step.at)}</span>}
      </p>
      <Markdown text={step.plan} />
      {step.feedback && (
        <p className="rounded-lg bg-tint-2 px-3 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap">{step.feedback}</p>
      )}
    </li>
  );
}

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
      {step.at && <span className="shrink-0 text-faint tabular-nums opacity-0 group-hover/tool:opacity-100">{formatClock(step.at)}</span>}
    </>
  );
  if (!step.detail) return <li className="group/tool flex items-baseline gap-2 px-2 py-0.5 font-mono text-[12px]">{line}</li>;
  return (
    <li>
      <details className="group/tool">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-md px-2 py-0.5 font-mono text-[12px] hover:bg-tint-2">
          {line}
        </summary>
        {step.document ? (
          <div className="mx-2 mt-1 mb-2 max-h-96 overflow-auto rounded-lg bg-tint-2 px-3 py-2">
            <Markdown text={step.document.content} />
          </div>
        ) : (
          <pre className="mx-2 mt-1 mb-2 max-h-72 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
            {step.detail}
          </pre>
        )}
      </details>
    </li>
  );
}

type ToolRun = [ToolStep, ...ToolStep[]];

interface ToolGroupRowProps {
  steps: ToolRun;
  last: ToolStep;
}

function groupStatus(steps: ToolRun, last: ToolStep): ToolStatus {
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "error")) return "error";
  return last.status;
}

function toolCounts(steps: ToolStep[]): string {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(step.name, (counts.get(step.name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(" · ");
}

/** A run of back-to-back tool calls folded into one line: what ran, the latest call, and when. */
function ToolGroupRow({ steps, last }: ToolGroupRowProps) {
  const status = groupStatus(steps, last);
  return (
    <li>
      <details className="group/tools">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-md px-2 py-0.5 font-mono text-[12px] hover:bg-tint-2">
          <span className={`shrink-0 ${STATUS_DOT[status]}`} title={STATUS_LABEL[status]}>
            ●
          </span>
          <span className="max-w-[55%] shrink-0 truncate font-semibold">{toolCounts(steps)}</span>
          <span className={`min-w-0 flex-1 truncate ${status === "running" ? "text-fg" : "text-muted"}`}>{last.summary}</span>
          {last.at && <span className="shrink-0 text-faint tabular-nums">{formatClock(last.at)}</span>}
          <span aria-hidden className="shrink-0 text-faint transition-transform group-open/tools:rotate-90">
            ›
          </span>
        </summary>
        <ol className="mt-0.5 mb-1 ml-3 flex flex-col gap-0.5 border-l border-hair pl-1">
          {steps.map((step) => (
            <ToolRow key={step.id} step={step} />
          ))}
        </ol>
      </details>
    </li>
  );
}

type ChatItem = { kind: "step"; step: ActivityStep } | { kind: "tools"; steps: ToolRun; last: ToolStep };

/** Back-to-back tool calls become one group; a lone call stays its own row. */
function groupSteps(steps: ActivityStep[]): ChatItem[] {
  return steps.reduce<ChatItem[]>((items, step) => {
    const previous = items.at(-1);
    if (step.kind !== "tool") return [...items, { kind: "step", step }];
    if (previous?.kind === "tools") return [...items.slice(0, -1), { kind: "tools", steps: [...previous.steps, step], last: step }];
    if (previous?.kind === "step" && previous.step.kind === "tool") {
      return [...items.slice(0, -1), { kind: "tools", steps: [previous.step, step], last: step }];
    }
    return [...items, { kind: "step", step }];
  }, []);
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
  if (step.kind === "question") return <QuestionRow step={step} />;
  if (step.kind === "plan") return <PlanRow step={step} />;
  if (step.kind === "ui") return <UiRow step={step} />;
  if (step.kind === "output") {
    return (
      <li className="py-1">
        <pre
          className={`max-h-72 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap ${
            step.error ? "text-accent" : "text-muted"
          }`}
        >
          {step.text}
        </pre>
      </li>
    );
  }
  if (step.kind === "thinking") {
    return (
      <li className="flex gap-2 py-1 text-[13px] leading-relaxed text-muted">
        <span aria-hidden className="shrink-0 text-faint">
          ∴
        </span>
        <p className="min-w-0 whitespace-pre-wrap">{step.text}</p>
      </li>
    );
  }
  if (step.kind === "prompt" && step.queued) {
    return (
      <li className="flex flex-col items-end gap-1 py-1">
        <p className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-faint px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-muted">
          {step.text}
        </p>
        <span className="text-[11px] text-muted">대기 중 · 지금 하는 일이 끝나면 전달돼요</span>
      </li>
    );
  }
  if (step.kind === "prompt") {
    return (
      <li className="flex justify-end py-1">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-prompt px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-prompt-ink">
          {step.text}
        </p>
      </li>
    );
  }
  return <TextRow text={step.text} copyable={copyable} />;
}

export type ChatLayout = "box" | "page";

interface ChatViewProps {
  sessionId: string;
  /** Live terminal the answers from agent-drawn cards are typed into. */
  terminalHandle?: string | null;
  working: boolean;
  layout: ChatLayout;
}

export function ChatView({ sessionId, terminalHandle = null, working, layout }: ChatViewProps) {
  const chat = useQuery(chatQueryOptions(sessionId));
  const isQueued = (step: ActivityStep) => step.kind === "prompt" && step.queued === true;
  const steps = chat.data?.filter((step) => !isQueued(step)) ?? null;
  // Claude Code takes queued input as soon as it goes idle, so anything still listed then was pulled back or lost.
  const queued = working ? (chat.data?.filter(isQueued) ?? []) : [];
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastTextId = steps?.findLast((step) => step.kind === "text")?.id ?? null;

  useEffect(() => {
    if (!stickRef.current) return;
    if (layout === "page") {
      endRef.current?.scrollIntoView({ block: "end" });
      return;
    }
    const list = listRef.current;
    if (!list) return;
    const bottom = list.scrollHeight - list.clientHeight;
    if (Math.abs(list.scrollTop - bottom) > 1) list.scrollTop = bottom;
  }, [chat.data, working, layout]);

  useEffect(() => {
    if (layout !== "page") return;
    const onWindowScroll = () => {
      const end = endRef.current;
      if (!end) return;
      stickRef.current = end.getBoundingClientRect().bottom - window.innerHeight < STICK_PX;
    };
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, [layout]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (layout === "page") return;
    const list = event.currentTarget;
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_PX;
  };

  if (chat.error) return <StatusLine error={chat.error} label="대화를 읽지 못했어요" />;
  if (!steps) return <p className="text-[12px] text-muted">불러오는 중…</p>;

  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      data-chat
      className={`flex min-h-24 flex-col gap-2 pr-1 wrap-anywhere ${layout === "box" ? "max-h-[36rem] overflow-y-auto" : ""}`}
    >
      {steps.length === 0 ? (
        <p className="text-[13px] text-muted">아직 대화가 없어요</p>
      ) : (
        <UiActionTarget.Provider value={terminalHandle}>
          <ol className="flex flex-col gap-0.5">
            {groupSteps(steps).map((item) =>
              item.kind === "tools" ? (
                <ToolGroupRow key={`tools-${item.steps[0].id}`} steps={item.steps} last={item.last} />
              ) : (
                <ChatRow key={item.step.id} step={item.step} copyable={!working && item.step.id === lastTextId} />
              ),
            )}
          </ol>
        </UiActionTarget.Provider>
      )}
      {working && (
        <p className="flex items-center gap-1.5 px-2 text-[12px] text-now">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          작업 중
        </p>
      )}
      {queued.length > 0 && (
        <ol className="flex flex-col gap-0.5">
          {queued.map((step) => (
            <ChatRow key={step.id} step={step} copyable={false} />
          ))}
        </ol>
      )}
      <div ref={endRef} aria-hidden className="scroll-mb-40" />
    </div>
  );
}
