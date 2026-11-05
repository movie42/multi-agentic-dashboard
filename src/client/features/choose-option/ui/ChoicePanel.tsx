"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { terminalScreenQueryOptions } from "@/client/entities/terminal";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { StatusLine } from "@/client/shared/ui/StatusLine";

interface ChoicePanelProps {
  terminalHandle: string;
}

export function ChoicePanel({ terminalHandle }: ChoicePanelProps) {
  const screenQuery = useQuery(terminalScreenQueryOptions(terminalHandle));
  const [sending, setSending] = useState<number | null>(null);

  const choose = async (option: number) => {
    setSending(option);
    try {
      await postAction({ type: "choose-option", terminalHandle, option });
    } catch (chooseError) {
      toastError("choice", chooseError, { terminalHandle, option });
      setSending(null);
    }
  };

  const choice = screenQuery.data?.choice ?? null;
  if (!choice) {
    return <StatusLine error={screenQuery.error} label="터미널 화면을 읽지 못했어요" />;
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-bg p-4 shadow-[inset_0_0_0_1.5px_var(--accent)]">
      {choice.context.length > 0 && (
        <pre className="max-h-48 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-muted">
          {choice.context.join("\n")}
        </pre>
      )}
      {choice.question && <p className="text-[14px] font-bold">{choice.question}</p>}
      <div className="flex flex-col gap-1.5">
        {choice.options.map((option) => (
          <button
            key={option.number}
            type="button"
            disabled={sending !== null}
            onClick={() => void choose(option.number)}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-snug disabled:opacity-40 ${
              option.number === 1 ? "bg-fg font-semibold text-bg hover:opacity-85" : "bg-tint-2 hover:bg-fg hover:text-bg"
            }`}
          >
            <span className="font-mono opacity-60">{option.number}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {sending !== null && <p className="text-[12px] text-muted">{sending}번을 보냈어요. 상태가 곧 바뀌어요.</p>}
      <StatusLine error={screenQuery.error} label="터미널 화면을 읽지 못했어요" />
    </div>
  );
}
