"use client";

import type { ReservedCard } from "../model/graph";

interface ReservedBoxProps {
  reserved: ReservedCard;
  selected: boolean;
}

export function cardFlags(card: ReservedCard["card"]): string[] {
  return [
    card.kind === "judge" ? "판단" : null,
    card.continueFrom ? "앞 세션에 이어서" : null,
    card.pauseAfter ? "끝나면 멈춤" : null,
    card.check ? "확인 명령" : null,
    card.model,
    card.effort,
  ].flatMap((flag) => (flag ? [flag] : []));
}

export function ReservedBox({ reserved, selected }: ReservedBoxProps) {
  const { card, run } = reserved;
  const flags = cardFlags(card);
  return (
    <div
      className={`flex h-full flex-col gap-1 overflow-hidden rounded-[10px] border-[1.5px] border-dashed border-faint bg-canvas-card-fill/70 px-3 py-2.5 text-muted select-none ${
        selected ? "ring-2 ring-fg ring-offset-2 ring-offset-canvas" : ""
      }`}
    >
      <p className="flex items-center gap-1.5 text-[11px] leading-none font-semibold tracking-[0.02em]">
        <span className="size-1.5 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--faint)]" />
        <span>예약 카드</span>
        <span className="ml-auto truncate font-normal">{run.name}</span>
      </p>
      <p className="truncate text-[14px] leading-snug font-bold text-fg/70">{card.title}</p>
      <p className="truncate text-[12px]">{card.prompt.split("\n")[0] || "프롬프트 없음"}</p>
      {flags.length > 0 && (
        <p className="mt-auto flex min-w-0 gap-1 overflow-hidden text-[11px] leading-none">
          {flags.map((flag) => (
            <span key={flag} className="shrink-0 rounded-[5px] bg-tint px-1.5 py-1">
              {flag}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
