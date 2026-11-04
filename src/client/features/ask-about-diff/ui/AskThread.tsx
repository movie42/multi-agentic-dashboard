"use client";

import { createContext, startTransition, use, useActionState, useState } from "react";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import type { AskAnchor, AskContext, AskTarget, AskThread } from "@/common/intentDiff/types";
import { AnswerMarkdown } from "./AnswerMarkdown";
import { AskBoardContext } from "../model/useAskBoard";

/** The plan item whose flow is on screen, for the question's context. */
export const AskPlanItem = createContext<{ id: string; title: string } | null>(null);

/** The flow step being read, for the question's context and the step-wide question. */
export interface AskStep {
  symbolId: string;
  label: string;
  intents: string[];
  file: string;
  startLine: number;
  endLine: number;
}

export const AskStepContext = createContext<AskStep | null>(null);

function targetText(target: AskTarget): string {
  if (target.kind === "writer") return `이 코드를 쓴 세션(${target.sessionId.slice(0, 8)})의 사본`;
  if (target.reason === "chosen") return "새 세션";
  if (target.reason === "writer-gone") return "새 세션 · 쓴 세션의 기록이 지워짐";
  return "새 세션 · 이 줄을 쓴 세션을 찾지 못함";
}

function anchorText(anchor: AskAnchor): string {
  const name = anchor.file.split("/").pop() ?? anchor.file;
  return anchor.startLine === anchor.endLine ? `${name}:${anchor.startLine}` : `${name}:${anchor.startLine}–${anchor.endLine}`;
}

interface QuestionBoxProps {
  placeholder: string;
  submitLabel: string;
  scope: string;
  notice?: string | null;
  onSubmit: (question: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  children?: React.ReactNode;
}

function QuestionBox({ placeholder, submitLabel, scope, notice = null, onSubmit, onCancel, autoFocus = false, children }: QuestionBoxProps) {
  const [text, setText] = useState("");
  const [failure, dispatch, pending] = useActionState(async (_previous: string | null, question: string): Promise<string | null> => {
    try {
      await onSubmit(question);
      setText("");
      return null;
    } catch (error) {
      toastError(scope, error);
      return error instanceof Error ? error.message : String(error);
    }
  }, null);
  const error = notice ?? (pending ? null : failure);
  const submit = () => {
    if (!text.trim() || pending) return;
    const question = text.trim();
    startTransition(() => dispatch(question));
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        rows={3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-hair bg-bg px-2.5 py-2 font-sans text-[13px] leading-[1.5] outline-none focus:border-focus"
      />
      {error && <p className="text-[12px] text-accent">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 font-sans text-[12px]">
        {children}
        <span className="flex-1" />
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-muted hover:text-fg">
            닫기
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || pending}
          className="rounded-md bg-fg px-3 py-1 font-semibold text-bg disabled:opacity-40"
        >
          {pending ? "보내는 중…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

interface DraftProps {
  anchor: AskAnchor;
  context: AskContext;
  onClose: () => void;
}

/** A question about lines that have no conversation yet. */
export function AskDraft({ anchor, context, onClose }: DraftProps) {
  const board = use(AskBoardContext);
  const [fresh, setFresh] = useState(false);
  if (!board) return null;
  const writer = board.writerOf(anchor.file, anchor.startLine, anchor.endLine);

  const submit = (question: string) => board.ask({ question, anchor, context, writerSessionId: writer, fresh }, () => onClose());

  return (
    <div className="my-2 rounded-lg border border-hair bg-bg p-3 font-sans">
      <p className="mb-2 text-[12px] text-muted">
        {anchorText(anchor)} · {context.label}
      </p>
      <QuestionBox placeholder="이 코드에 대해 물어볼 것 (⌘↵ 보내기)" submitLabel="묻기" scope="ask" onSubmit={submit} onCancel={onClose} autoFocus>
        {writer ? (
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={fresh} onChange={(event) => setFresh(event.target.checked)} />
            새 세션에게 묻기
          </label>
        ) : (
          <span className="text-muted">이 줄을 쓴 세션을 찾지 못해 새 세션에게 물어요</span>
        )}
      </QuestionBox>
    </div>
  );
}

interface ThreadViewProps {
  thread: AskThread;
}

/** A saved conversation, shown under the lines it is about. */
export function ThreadView({ thread }: ThreadViewProps) {
  const board = use(AskBoardContext);
  const [open, setOpen] = useState(true);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  if (!board) return null;
  const live = board.live[thread.id];
  const last = thread.turns[thread.turns.length - 1];
  const waiting = last?.answer === null && last.error === null;

  const followUp = (question: string) => {
    setTerminalError(null);
    return board.ask({ question, threadId: thread.id });
  };

  const continueInTerminal = () => {
    setTerminalError(null);
    postAction({ type: "resume-session", sessionId: thread.sessionId, cwd: thread.cwd, title: `질문 · ${thread.label}` }).catch(
      (failure: unknown) => {
        toastError("ask resume", failure);
        setTerminalError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };

  return (
    <div className="my-2 rounded-lg border border-hair bg-bg font-sans">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-[12px] text-muted hover:text-fg"
      >
        <span className="w-3 text-[11px]">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-fg">질문 {thread.turns.length}</span>
        <span>{anchorText(thread.anchor)}</span>
        <span>· {targetText(thread.target)}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-hair px-3 py-3">
          {thread.turns.map((turn, index) => (
            <div key={turn.askedAt} className="flex flex-col gap-1.5">
              <p className="self-start rounded-md bg-tint px-2.5 py-1.5 text-[13px] whitespace-pre-wrap">{turn.question}</p>
              {turn.answer !== null ? (
                <AnswerMarkdown text={turn.answer} />
              ) : turn.error !== null ? (
                <p className="text-[12px] text-accent">답을 받지 못했어요: {turn.error}</p>
              ) : index === thread.turns.length - 1 && live ? (
                <div className="text-[13px] leading-[1.6]">
                  {live.tools.length > 0 && <p className="mb-1 font-mono text-[11px] text-muted">{live.tools[live.tools.length - 1]}</p>}
                  {live.text ? <AnswerMarkdown text={live.text} live /> : <p className="text-[12px] text-muted">세션 기록을 읽는 중…</p>}
                </div>
              ) : (
                <p className="text-[12px] text-muted">
                  답을 기다리는 중이에요.{" "}
                  <button type="button" onClick={board.reload} className="underline decoration-faint underline-offset-[3px] hover:text-fg">
                    다시 읽기
                  </button>
                </p>
              )}
            </div>
          ))}
          {!waiting && (
            <QuestionBox placeholder="이어서 묻기 (⌘↵ 보내기)" submitLabel="이어 묻기" scope="ask" notice={terminalError} onSubmit={followUp}>
              <button type="button" onClick={continueInTerminal} className="text-muted underline decoration-faint underline-offset-[3px] hover:text-fg">
                터미널에서 이어 가기
              </button>
            </QuestionBox>
          )}
        </div>
      )}
    </div>
  );
}
