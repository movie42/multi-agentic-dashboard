"use client";

import { DICTATION_HANDLE } from "@/common/runner/types";
import { useVoice } from "@/client/shared/lib/useVoice";
import { VoiceButton } from "./VoiceButton";

interface DictationButtonProps {
  onText: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function appendDictation(current: string, text: string): string {
  const added = text.trim();
  if (!added) return current;
  if (!current.trim()) return added;
  return /\s$/.test(current) ? `${current}${added}` : `${current} ${added}`;
}

export function DictationButton({ onText, disabled = false, className = "" }: DictationButtonProps) {
  const voice = useVoice(DICTATION_HANDLE, onText);

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <VoiceButton recording={voice.recording} pending={voice.pending} disabled={disabled} onToggle={() => void voice.toggle()} recordingLabel="듣는 중 · 다시 누르면 받아쓴 글을 이 칸에 채워요" />
      {(voice.recording || voice.pending) && (
        <span className="pointer-events-none absolute right-0 bottom-full z-10 mb-1 max-w-[280px] truncate rounded-[6px] bg-fg px-2 py-1 text-[11px] text-bg">
          {voice.pending && !voice.recording ? "받아쓰기 준비 중…" : voice.transcript || "듣고 있어요…"}
        </span>
      )}
    </span>
  );
}
