"use client";

import { useEffect, useState } from "react";
import type { TerminalScreen, TerminalScreenResponse } from "@/lib/orca/screen";
import { postAction } from "./actions";

const POLL_MS = 2000;

interface ChoicePanelProps {
  terminalHandle: string;
}

export function ChoicePanel({ terminalHandle }: ChoicePanelProps) {
  const [screen, setScreen] = useState<TerminalScreen | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/terminal?handle=${encodeURIComponent(terminalHandle)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<TerminalScreenResponse>)
        .then((payload) => {
          if (cancelled) return;
          if (payload.ok) setScreen(payload.screen);
          else setError(payload.error);
        })
        .catch((loadError: unknown) => {
          if (!cancelled) setError(String(loadError));
        });
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [terminalHandle]);

  const choose = async (option: number) => {
    setSending(option);
    setError(null);
    try {
      await postAction({ type: "choose-option", terminalHandle, option });
    } catch (chooseError) {
      console.error("[choice]", chooseError);
      setError(chooseError instanceof Error ? chooseError.message : String(chooseError));
      setSending(null);
    }
  };

  const choice = screen?.choice ?? null;
  if (!choice) {
    return error ? <p className="text-[12px] text-accent">터미널 화면을 읽지 못했어요: {error}</p> : null;
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
      {error && <p className="text-[12px] text-accent">못 보냈어요: {error}</p>}
    </div>
  );
}
