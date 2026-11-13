"use client";

import { startTransition, useActionState, useState } from "react";
import type { RunnerPermission, RunnerPermissionAnswer, RunnerPermissionSuggestion } from "@/common/runner/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

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

interface PermissionPromptProps {
  terminalHandle: string;
  permission: RunnerPermission;
}

export function PermissionPrompt({ terminalHandle, permission }: PermissionPromptProps) {
  const { status, send, locked } = useSend(terminalHandle, permission.id);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");

  const onReasonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value);

  return (
    <div data-permission-prompt className="flex flex-col gap-2.5 rounded-[10px] bg-bg p-3 shadow-[inset_0_0_0_1.5px_var(--st-ask)]">
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
      {status.kind === "sent" && <p className="text-[12px] text-muted">보냈어요. 상태가 곧 바뀌어요.</p>}
      {status.kind === "error" && <p className="text-[12px] text-accent">못 보냈어요: {status.message}</p>}
    </div>
  );
}
