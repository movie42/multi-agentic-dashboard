"use client";

interface VoiceButtonProps {
  recording: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function VoiceButton({ recording, pending, disabled, onToggle }: VoiceButtonProps) {
  const label = recording ? "듣는 중 · 다시 누르면 보내요" : "음성으로 말하기 · Claude Code /voice";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={recording}
      title={label}
      onClick={onToggle}
      disabled={(disabled && !recording) || pending}
      className={`grid size-7 shrink-0 place-items-center rounded-full disabled:opacity-30 ${
        recording ? "bg-accent text-accent-ink animate-pulse" : "text-muted hover:bg-tint-2 hover:text-fg"
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}
