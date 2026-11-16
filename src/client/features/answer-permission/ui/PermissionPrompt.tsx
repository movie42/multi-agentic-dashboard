"use client";

import { startTransition, useActionState, useState } from "react";
import { questionsOf, type RunnerQuestion } from "@/common/runner/questions";
import type { RunnerPermission, RunnerPermissionAnswer, RunnerPermissionSuggestion } from "@/common/runner/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { Markdown } from "@/client/shared/ui/Markdown";

type SendResult = { kind: "idle" } | { kind: "sent" } | { kind: "error"; message: string };

type SendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

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

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item: unknown) => (typeof item === "string" ? [item] : [])) : [];
}

function ruleText(rule: unknown): string | null {
  if (typeof rule !== "object" || rule === null) return null;
  const toolName = text(Reflect.get(rule, "toolName"));
  const content = text(Reflect.get(rule, "ruleContent"));
  if (!toolName) return null;
  return content ? `${toolName}(${content})` : toolName;
}

export function suggestionLabel(suggestion: RunnerPermissionSuggestion): string {
  if (suggestion.type === "addRules" && Array.isArray(suggestion.rules)) {
    const rules = suggestion.rules.flatMap((rule: unknown) => {
      const label = ruleText(rule);
      return label ? [label] : [];
    });
    return `다시 묻지 않기 · ${rules.join(", ")}`;
  }
  if (suggestion.type === "addDirectories") return `폴더 허용 · ${strings(suggestion.directories).join(", ")}`;
  if (suggestion.type === "setMode") return `모드 전환 · ${text(suggestion.mode) ?? ""}`;
  return String(suggestion.type);
}

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

interface ToolInputViewProps {
  toolInput: Record<string, unknown>;
}

function ToolInputView({ toolInput }: ToolInputViewProps) {
  // ExitPlanMode carries the whole plan as markdown; JSON would show it as one escaped line.
  const plan = text(toolInput.plan);
  if (plan) {
    return (
      <div className="max-h-96 overflow-auto rounded-lg bg-tint-2 px-3 py-2">
        <Markdown text={plan} />
      </div>
    );
  }
  const command = text(toolInput.command);
  const filePath = text(toolInput.file_path);
  const description = text(toolInput.description);
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
            onClick={() => send({ behavior: "deny", message: reason.trim() })}
            className="cursor-pointer rounded-full bg-accent px-4 py-1.5 text-[13px] leading-5 font-semibold text-accent-ink hover:opacity-85 disabled:cursor-default disabled:opacity-30"
          >
            거부
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={locked} onClick={() => send({ behavior: "allow", suggestionIndex: null })} className={PRIMARY}>
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
              key={`${String(suggestion.type)}-${index}`}
              type="button"
              disabled={locked}
              onClick={() => send({ behavior: "allow", suggestionIndex: index })}
              className="flex max-w-full cursor-pointer items-baseline gap-1.5 rounded-full bg-tint-2 px-3 py-1 text-left text-[12px] hover:bg-fg hover:text-bg disabled:cursor-default disabled:opacity-30"
            >
              <span className="truncate">{suggestionLabel(suggestion)}</span>
              {typeof suggestion.destination === "string" && (
                <span className="shrink-0 text-[11px] opacity-60">
                  {DESTINATION_LABEL[suggestion.destination] ?? suggestion.destination}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <StatusLine status={status} />
    </>
  );
}

interface QuestionPromptProps extends PromptBodyProps {
  questions: RunnerQuestion[];
}

function QuestionPrompt({ terminalHandle, permission, questions }: QuestionPromptProps) {
  const { status, send, locked } = useSend(terminalHandle, permission.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const instant = questions.length === 1 && !questions[0]?.multiSelect;

  const answerFor = (question: RunnerQuestion): string => {
    const own = (typed[question.question] ?? "").trim();
    if (own) return own;
    return (picked[question.question] ?? []).join(", ");
  };
  const ready = questions.every((question) => answerFor(question) !== "");

  const submit = (answers: Record<string, string>) => send({ behavior: "answer", answers });

  const pick = (question: RunnerQuestion, label: string) => {
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

  const onType = (question: RunnerQuestion) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setTyped((previous) => ({ ...previous, [question.question]: event.target.value }));

  const onTypeKeyDown = (question: RunnerQuestion) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !instant) return;
    const own = (typed[question.question] ?? "").trim();
    if (own) submit({ [question.question]: own });
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
              <p className="text-[14px] font-bold whitespace-pre-wrap">{question.question}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {question.options.map((option) => {
                const on = selected.includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={locked}
                    aria-pressed={question.multiSelect || !instant ? on : undefined}
                    onClick={() => pick(question, option.label)}
                    className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-[13px] leading-snug disabled:cursor-default disabled:opacity-40 ${
                      on ? "bg-fg text-bg" : "bg-bg shadow-[inset_0_0_0_1px_var(--hair)] hover:shadow-[inset_0_0_0_1.5px_var(--fg)]"
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
                aria-label={`${question.question} 직접 입력`}
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
            onClick={() => submit(Object.fromEntries(questions.map((question) => [question.question, answerFor(question)])))}
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

interface PermissionPromptProps {
  terminalHandle: string;
  permission: RunnerPermission;
}

export function PermissionPrompt({ terminalHandle, permission }: PermissionPromptProps) {
  const questions = questionsOf(permission);
  return (
    <div data-permission-prompt className="flex flex-col gap-2.5 rounded-[10px] bg-bg p-3 shadow-[inset_0_0_0_1.5px_var(--st-ask)]">
      {questions.length > 0 ? (
        <QuestionPrompt terminalHandle={terminalHandle} permission={permission} questions={questions} />
      ) : (
        <ToolPrompt terminalHandle={terminalHandle} permission={permission} />
      )}
    </div>
  );
}
