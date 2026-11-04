"use client";

import { useState } from "react";
import { ASK_USER_QUESTION, questionsOf } from "@/lib/permissions/questions";
import type {
  PendingPermission,
  PermissionAnswer,
  PermissionSuggestion,
  UserQuestion,
} from "@/lib/permissions/types";
import { postAction } from "@/client/shared/api/actions";

type SendStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const DESTINATION_LABEL: Record<string, string> = {
  session: "이번 세션",
  localSettings: "이 프로젝트 (나만)",
  projectSettings: "이 프로젝트",
  userSettings: "모든 프로젝트",
  cliArg: "실행 인자",
};

const PRIMARY =
  "cursor-pointer rounded-full bg-fg px-4 py-1.5 text-[13px] leading-5 font-semibold text-bg hover:opacity-85 disabled:cursor-default disabled:opacity-30";
const SECONDARY =
  "cursor-pointer rounded-full px-4 py-1.5 text-[13px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2 disabled:cursor-default disabled:opacity-30";

function suggestionLabel(suggestion: PermissionSuggestion): string {
  if (suggestion.type === "addRules") {
    const rules = suggestion.rules
      .map((rule) => (rule.ruleContent ? `${rule.toolName}(${rule.ruleContent})` : rule.toolName))
      .join(", ");
    return `다시 묻지 않기 · ${rules}`;
  }
  if (suggestion.type === "addDirectories") return `폴더 허용 · ${suggestion.directories.join(", ")}`;
  return `모드 전환 · ${suggestion.mode}`;
}

function stringField(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value ? value : null;
}

function useSend(requestId: string) {
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });
  const send = async (answer: PermissionAnswer) => {
    if (status.kind === "sending" || status.kind === "sent") return;
    setStatus({ kind: "sending" });
    try {
      await postAction({ type: "answer-permission", requestId, answer });
      setStatus({ kind: "sent" });
    } catch (error) {
      console.error("[permission]", error);
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };
  return { status, send, locked: status.kind === "sending" || status.kind === "sent" };
}

interface StatusLineProps {
  status: SendStatus;
}

function StatusLine({ status }: StatusLineProps) {
  if (status.kind === "sent") return <p className="text-[12px] text-muted">보냈어요. 상태가 곧 바뀌어요.</p>;
  if (status.kind === "error") return <p className="text-[12px] text-accent">못 보냈어요: {status.message}</p>;
  return null;
}

interface ToolInputViewProps {
  toolInput: Record<string, unknown>;
}

function ToolInputView({ toolInput }: ToolInputViewProps) {
  const command = stringField(toolInput, "command");
  const filePath = stringField(toolInput, "file_path");
  const description = stringField(toolInput, "description");
  const body = command ?? filePath ?? JSON.stringify(toolInput, null, 2);
  return (
    <div className="flex flex-col gap-1">
      <pre className="max-h-48 overflow-auto rounded-lg bg-tint-2 px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
        {body}
      </pre>
      {description && <p className="text-[12px] text-muted">{description}</p>}
    </div>
  );
}

interface ToolPermissionProps {
  permission: PendingPermission;
}

function ToolPermission({ permission }: ToolPermissionProps) {
  const { status, send, locked } = useSend(permission.id);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");

  const onReasonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value);

  return (
    <>
      <p className="text-[14px] font-bold">{permission.toolName} 실행 허락이 필요해요</p>
      <ToolInputView toolInput={permission.toolInput} />
      {denying ? (
        <div className="flex items-end gap-2 rounded-[10px] bg-bg px-3 py-2 shadow-[inset_0_0_0_1px_var(--hair)] focus-within:shadow-[inset_0_0_0_1.5px_var(--faint)]">
          <textarea
            rows={1}
            autoFocus
            value={reason}
            onChange={onReasonChange}
            placeholder="거부 사유 (Claude에게 전달돼요)"
            className="field-sizing-content max-h-32 min-h-6 flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-muted"
          />
          <button type="button" disabled={locked} onClick={() => setDenying(false)} className={SECONDARY}>
            취소
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => void send({ behavior: "deny", message: reason.trim() })}
            className="cursor-pointer rounded-full bg-accent px-4 py-1.5 text-[13px] leading-5 font-semibold text-accent-ink hover:opacity-85 disabled:cursor-default disabled:opacity-30"
          >
            거부
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={locked}
            onClick={() => void send({ behavior: "allow", suggestionIndex: null })}
            className={PRIMARY}
          >
            허용
          </button>
          <button type="button" disabled={locked} onClick={() => setDenying(true)} className={`${SECONDARY} text-accent`}>
            거부
          </button>
        </div>
      )}
      {!denying && permission.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {permission.suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${index}`}
              type="button"
              disabled={locked}
              onClick={() => void send({ behavior: "allow", suggestionIndex: index })}
              className="flex max-w-full cursor-pointer items-baseline gap-1.5 rounded-full bg-tint-2 px-3 py-1 text-left text-[12px] hover:bg-fg hover:text-bg disabled:cursor-default disabled:opacity-30"
            >
              <span className="truncate">{suggestionLabel(suggestion)}</span>
              <span className="shrink-0 text-[11px] opacity-60">
                {DESTINATION_LABEL[suggestion.destination] ?? suggestion.destination}
              </span>
            </button>
          ))}
        </div>
      )}
      <StatusLine status={status} />
    </>
  );
}

interface QuestionPermissionProps {
  permission: PendingPermission;
  questions: UserQuestion[];
}

function QuestionPermission({ permission, questions }: QuestionPermissionProps) {
  const { status, send, locked } = useSend(permission.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const instant = questions.length === 1 && !questions[0].multiSelect;

  const answerOf = (question: UserQuestion): string => {
    const own = (typed[question.question] ?? "").trim();
    if (own) return own;
    return (picked[question.question] ?? []).join(", ");
  };
  const ready = questions.every((question) => answerOf(question) !== "");

  const submit = (answers: Record<string, string>) => void send({ behavior: "answer", answers });

  const pick = (question: UserQuestion, label: string) => {
    if (instant) {
      submit({ [question.question]: label });
      return;
    }
    setPicked((previous) => {
      const current = previous[question.question] ?? [];
      const next = question.multiSelect
        ? current.includes(label)
          ? current.filter((item) => item !== label)
          : [...current, label]
        : [label];
      return { ...previous, [question.question]: next };
    });
  };

  const onType = (question: UserQuestion) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setTyped((previous) => ({ ...previous, [question.question]: event.target.value }));

  const onTypeKeyDown = (question: UserQuestion) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !instant) return;
    const text = (typed[question.question] ?? "").trim();
    if (text) submit({ [question.question]: text });
  };

  return (
    <>
      {questions.map((question) => {
        const selected = picked[question.question] ?? [];
        return (
          <div key={question.question} className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              {question.header && (
                <span className="self-start rounded-md bg-tint-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {question.header}
                </span>
              )}
              <p className="text-[14px] font-bold">{question.question}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {question.options.map((option) => {
                const on = selected.includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={locked}
                    onClick={() => pick(question, option.label)}
                    className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-[13px] leading-snug disabled:cursor-default disabled:opacity-40 ${
                      on
                        ? "bg-fg text-bg"
                        : "bg-bg shadow-[inset_0_0_0_1px_var(--hair)] hover:shadow-[inset_0_0_0_1.5px_var(--fg)]"
                    }`}
                  >
                    <span className="font-semibold">
                      {question.multiSelect && <span className="mr-1.5 font-mono">{on ? "☑" : "☐"}</span>}
                      {option.label}
                    </span>
                    {option.description && <span className="text-[12px] opacity-70">{option.description}</span>}
                  </button>
                );
              })}
              <input
                type="text"
                disabled={locked}
                value={typed[question.question] ?? ""}
                onChange={onType(question)}
                onKeyDown={onTypeKeyDown(question)}
                placeholder="직접 입력"
                className="rounded-lg bg-bg px-3 py-2 text-[13px] shadow-[inset_0_0_0_1px_var(--hair)] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
              />
            </div>
          </div>
        );
      })}
      {!instant && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={locked || !ready}
            onClick={() => submit(Object.fromEntries(questions.map((question) => [question.question, answerOf(question)])))}
            className={PRIMARY}
          >
            보내기
          </button>
        </div>
      )}
      <StatusLine status={status} />
    </>
  );
}

interface PermissionPanelProps {
  permission: PendingPermission;
}

export function PermissionPanel({ permission }: PermissionPanelProps) {
  const questions = permission.toolName === ASK_USER_QUESTION ? questionsOf(permission.toolInput) : [];
  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-bg p-4 shadow-[inset_0_0_0_1.5px_var(--accent)]">
      {questions.length > 0 ? (
        <QuestionPermission permission={permission} questions={questions} />
      ) : (
        <ToolPermission permission={permission} />
      )}
    </div>
  );
}
