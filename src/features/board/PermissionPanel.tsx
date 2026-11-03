"use client";

import { useState } from "react";
import type { PendingPermission, PermissionAnswer, PermissionSuggestion } from "@/lib/permissions/types";
import { postAction } from "./actions";

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

interface PermissionPanelProps {
  permission: PendingPermission;
}

export function PermissionPanel({ permission }: PermissionPanelProps) {
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");

  const send = async (answer: PermissionAnswer) => {
    if (status.kind === "sending") return;
    setStatus({ kind: "sending" });
    try {
      await postAction({ type: "answer-permission", requestId: permission.id, answer });
      setStatus({ kind: "sent" });
    } catch (error) {
      console.error("[permission]", error);
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const onReasonChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value);
  const locked = status.kind === "sending" || status.kind === "sent";

  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-bg p-4 shadow-[inset_0_0_0_1.5px_var(--accent)]">
      <p className="text-[14px] font-bold">{permission.toolName} 실행 허락이 필요해요</p>
      <ToolInputView toolInput={permission.toolInput} />
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={locked}
          onClick={() => void send({ behavior: "allow", suggestionIndex: null })}
          className="rounded-lg bg-fg px-3 py-2 text-left text-[13px] font-semibold text-bg hover:opacity-85 disabled:opacity-40"
        >
          허용
        </button>
        {permission.suggestions.map((suggestion, index) => (
          <button
            key={`${suggestion.type}-${index}`}
            type="button"
            disabled={locked}
            onClick={() => void send({ behavior: "allow", suggestionIndex: index })}
            className="flex flex-col items-start gap-0.5 rounded-lg bg-tint-2 px-3 py-2 text-left text-[13px] leading-snug hover:bg-fg hover:text-bg disabled:opacity-40"
          >
            <span className="break-all">{suggestionLabel(suggestion)}</span>
            <span className="text-[11px] opacity-60">
              {DESTINATION_LABEL[suggestion.destination] ?? suggestion.destination}
            </span>
          </button>
        ))}
        {denying ? (
          <div className="flex items-end gap-2 rounded-lg bg-bg px-3 py-2 shadow-[inset_0_0_0_1px_var(--hair)]">
            <textarea
              rows={1}
              value={reason}
              onChange={onReasonChange}
              placeholder="거부 사유 (Claude에게 전달돼요)"
              className="field-sizing-content max-h-32 min-h-6 flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none placeholder:text-muted"
            />
            <button
              type="button"
              disabled={locked}
              onClick={() => void send({ behavior: "deny", message: reason.trim() })}
              className="shrink-0 rounded-full bg-accent px-3 py-1 text-[12px] leading-5 font-semibold text-accent-ink hover:opacity-85 disabled:opacity-30"
            >
              거부
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={locked}
            onClick={() => setDenying(true)}
            className="rounded-lg px-3 py-2 text-left text-[13px] text-accent shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2 disabled:opacity-40"
          >
            거부
          </button>
        )}
      </div>
      {status.kind === "sent" && <p className="text-[12px] text-muted">보냈어요. 상태가 곧 바뀌어요.</p>}
      {status.kind === "error" && <p className="text-[12px] text-accent">못 보냈어요: {status.message}</p>}
    </div>
  );
}
