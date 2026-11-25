"use client";

import { startTransition, useActionState, useState } from "react";
import type { UiAction } from "@/common/a2ui/actionText";
import { questionsOf, type RunnerQuestion } from "@/common/runner/questions";
import type { RunnerPermission, RunnerPermissionAnswer } from "@/common/runner/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { A2uiView } from "@/client/shared/ui/a2ui";
import { permissionSurface } from "../model/permissionSurface";
import { asksAboutPr } from "../model/prDraft";
import { answersFrom, questionSurface } from "../model/questionSurface";
import { PrDraftPreview } from "./PrDraftPreview";

type SendResult = { kind: "idle" } | { kind: "sent" } | { kind: "error"; message: string };

type SendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

function useSend(terminalHandle: string, requestId: string) {
  const [result, dispatch, sending] = useActionState(
    async (previous: SendResult, answer: RunnerPermissionAnswer): Promise<SendResult> => {
      if (previous.kind === "sent") return previous;
      try {
        await postAction({ type: "answer-permission", terminalHandle, requestId, answer });
        return { kind: "sent" };
      } catch (error) {
        toastError("permission", error);
        return { kind: "error", message: error instanceof Error ? error.message : String(error) };
      }
    },
    { kind: "idle" },
  );
  const status: SendStatus = sending ? { kind: "sending" } : result;
  const locked = sending || result.kind === "sent";
  const send = (answer: RunnerPermissionAnswer) => {
    if (locked) return;
    startTransition(() => dispatch(answer));
  };
  return { status, send, locked };
}

interface StatusLineProps {
  status: SendStatus;
}

function StatusLine({ status }: StatusLineProps) {
  if (status.kind === "sent") return <p className="text-[12px] text-muted">보냈어요. 상태가 곧 바뀌어요.</p>;
  if (status.kind === "error") return <p className="text-[12px] text-accent">못 보냈어요: {status.message}</p>;
  return null;
}

interface PromptBodyProps {
  terminalHandle: string;
  permission: RunnerPermission;
}

function ToolPrompt({ terminalHandle, permission }: PromptBodyProps) {
  const { status, send, locked } = useSend(terminalHandle, permission.id);
  const [denying, setDenying] = useState(false);

  const onAction = (action: UiAction) => {
    if (action.name === "allow") send({ behavior: "allow", suggestionIndex: null });
    else if (action.name === "allowSuggestion" && typeof action.context.index === "number") send({ behavior: "allow", suggestionIndex: action.context.index });
    else if (action.name === "openDeny") setDenying(true);
    else if (action.name === "cancelDeny") setDenying(false);
    else if (action.name === "deny") send({ behavior: "deny", message: typeof action.context.reason === "string" ? action.context.reason.trim() : "" });
  };

  return (
    <>
      <A2uiView messages={permissionSurface(permission, { denying })} onAction={onAction} locked={locked} />
      <StatusLine status={status} />
    </>
  );
}

interface QuestionPromptProps extends PromptBodyProps {
  questions: RunnerQuestion[];
  sessionId: string | null;
}

function QuestionPrompt({ terminalHandle, permission, questions, sessionId }: QuestionPromptProps) {
  const { status, send, locked } = useSend(terminalHandle, permission.id);

  const onAction = (action: UiAction) => {
    if (action.name === "answer") {
      const question = typeof action.context.question === "number" ? questions[action.context.question] : undefined;
      const answer = typeof action.context.text === "string" ? action.context.text.trim() : "";
      if (question && answer) send({ behavior: "answer", answers: { [question.question]: answer } });
    } else if (action.name === "submit") {
      send({ behavior: "answer", answers: answersFrom(questions, action.context) });
    }
  };

  return (
    <>
      {sessionId && asksAboutPr(questions) && <PrDraftPreview sessionId={sessionId} />}
      <A2uiView messages={questionSurface(questions)} onAction={onAction} locked={locked} />
      <StatusLine status={status} />
    </>
  );
}

interface PermissionPromptProps {
  terminalHandle: string;
  permission: RunnerPermission;
  /** Claude session id, used to find the PR body draft a "create this PR?" question refers to. */
  sessionId?: string | null;
}

export function PermissionPrompt({ terminalHandle, permission, sessionId = null }: PermissionPromptProps) {
  const questions = questionsOf(permission);
  return (
    <div data-permission-prompt className="flex flex-col gap-2.5 rounded-[10px] bg-bg p-3 shadow-[inset_0_0_0_1.5px_var(--st-ask)]">
      {questions.length > 0 ? (
        <QuestionPrompt terminalHandle={terminalHandle} permission={permission} questions={questions} sessionId={sessionId} />
      ) : (
        <ToolPrompt terminalHandle={terminalHandle} permission={permission} />
      )}
    </div>
  );
}
