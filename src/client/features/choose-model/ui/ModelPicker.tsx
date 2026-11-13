"use client";

import { useState, useTransition } from "react";
import { MODEL_CHOICES, type ModelChoice } from "@/common/actions/schema";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { ContextMenu, MenuHeading, MenuItem, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { Spinner } from "@/client/shared/ui/Spinner";

const MODEL_LABEL: Record<ModelChoice, string> = {
  default: "기본값",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
};

interface ModelPickerProps {
  terminalHandle: string;
  model: string | null;
  disabled?: boolean;
}

export function ModelPicker({ terminalHandle, model, disabled = false }: ModelPickerProps) {
  const [menu, setMenu] = useState<MenuPoint | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (choice: ModelChoice) => {
    setMenu(null);
    startTransition(async () => {
      await postAction({ type: "set-model", terminalHandle, model: choice }).catch((error: unknown) => toastError("model", error));
    });
  };

  return (
    <>
      <button
        type="button"
        data-model-picker
        disabled={disabled || pending}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        title="이 세션이 쓰는 모델 · 눌러서 바꾸기 (/model)"
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
        className="inline-flex max-w-56 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-muted hover:bg-tint-2 hover:text-fg disabled:opacity-50"
      >
        {pending && <Spinner />}
        <span className="truncate">{model ?? "모델 확인 전"}</span>
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {menu && (
        <ContextMenu at={menu} label="모델 고르기" onClose={() => setMenu(null)} widthClass="w-44">
          <MenuHeading>모델 바꾸기</MenuHeading>
          {MODEL_CHOICES.map((choice) => (
            <MenuItem key={choice} onSelect={() => choose(choice)}>
              {MODEL_LABEL[choice]}
            </MenuItem>
          ))}
        </ContextMenu>
      )}
    </>
  );
}
