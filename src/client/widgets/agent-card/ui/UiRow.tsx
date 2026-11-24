"use client";

import { createContext, startTransition, useActionState, useContext } from "react";
import type { UiAction } from "@/common/a2ui/actionText";
import type { ActivityStep } from "@/common/sessions/types";
import { postAction } from "@/client/shared/api/actions";
import { formatClock } from "@/client/shared/lib/format";
import { toastError } from "@/client/shared/model/toastStore";
import { A2uiView } from "@/client/shared/ui/a2ui";

type UiStep = Extract<ActivityStep, { kind: "ui" }>;

/** The live terminal that a card's answer is typed into; null when the session has no running terminal. */
export const UiActionTarget = createContext<string | null>(null);

type SendResult = { kind: "idle" } | { kind: "sent"; action: UiAction } | { kind: "error"; message: string };

function contextText(context: Record<string, unknown>): string {
  const entries = Object.entries(context);
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(" · ");
}

interface UiRowProps {
  step: UiStep;
}

export function UiRow({ step }: UiRowProps) {
  const terminalHandle = useContext(UiActionTarget);
  const [result, dispatch, sending] = useActionState(async (previous: SendResult, action: UiAction): Promise<SendResult> => {
    if (previous.kind === "sent" || !terminalHandle) return previous;
    try {
      await postAction({ type: "a2ui-action", terminalHandle, ...action });
      return { kind: "sent", action };
    } catch (error) {
      toastError("a2ui", error);
      return { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }, { kind: "idle" });
  const answered = step.action ?? (result.kind === "sent" ? result.action : null);
  const locked = answered !== null || sending || !terminalHandle;
  const onAction = (action: UiAction) => {
    if (locked) return;
    startTransition(() => dispatch(action));
  };
  return (
    <li data-ui-card className="my-1 flex flex-col gap-2.5 rounded-xl px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--hair)]">
      <p className="flex items-baseline gap-2 font-mono text-[12px] text-muted">
        <span className="font-semibold text-fg">카드</span>
        {step.at && <span className="ml-auto text-faint tabular-nums">{formatClock(step.at)}</span>}
      </p>
      <A2uiView messages={step.messages} onAction={onAction} locked={locked} />
      {answered ? (
        <p className="rounded-lg bg-tint-2 px-3 py-1.5 text-[12px] leading-relaxed">
          <span className="font-semibold">{answered.name}</span>
          {contextText(answered.context) && <span className="text-muted"> · {contextText(answered.context)}</span>}
        </p>
      ) : !terminalHandle ? (
        <p className="text-[12px] text-muted">터미널이 닫혀 있어서 답할 수 없어요</p>
      ) : null}
      {result.kind === "error" && <p className="text-[12px] text-accent">못 보냈어요: {result.message}</p>}
    </li>
  );
}
