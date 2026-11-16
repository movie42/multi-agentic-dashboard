"use client";

import { useState, useTransition } from "react";
import { EFFORT_CHOICES, type EffortChoice } from "@/common/actions/schema";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { ContextMenu, MenuHeading, MenuItem, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { Spinner } from "@/client/shared/ui/Spinner";

const EFFORT_LABEL: Record<EffortChoice, string> = {
  auto: "자동",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

interface EffortPickerProps {
  terminalHandle: string;
  effort: string | null;
  disabled?: boolean;
}

export function EffortPicker({ terminalHandle, effort, disabled = false }: EffortPickerProps) {
  const [menu, setMenu] = useState<MenuPoint | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (choice: EffortChoice) => {
    setMenu(null);
    startTransition(async () => {
      await postAction({ type: "set-effort", terminalHandle, effort: choice }).catch((error: unknown) => toastError("effort", error));
    });
  };

  return (
    <>
      <button
        type="button"
        data-effort-picker
        disabled={disabled || pending}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        title="이 세션이 생각을 얼마나 깊게 하는지 · 눌러서 바꾸기 (/effort)"
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
        className="inline-flex max-w-40 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-muted hover:bg-tint-2 hover:text-fg disabled:opacity-50"
      >
        {pending && <Spinner />}
        <span className="truncate">{effort ?? "effort"}</span>
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {menu && (
        <ContextMenu at={menu} label="effort 고르기" onClose={() => setMenu(null)} widthClass="w-56">
          <MenuHeading>effort 바꾸기</MenuHeading>
          <p data-effort-default-note className="px-2.5 pb-1.5 text-[12px] leading-snug text-muted">
            이 모델로 여는 새 세션 기본값도 바뀌어요
          </p>
          {EFFORT_CHOICES.map((choice) => (
            <MenuItem key={choice} onSelect={() => choose(choice)}>
              {choice === effort ? `${EFFORT_LABEL[choice]} ✓` : EFFORT_LABEL[choice]}
            </MenuItem>
          ))}
        </ContextMenu>
      )}
    </>
  );
}
