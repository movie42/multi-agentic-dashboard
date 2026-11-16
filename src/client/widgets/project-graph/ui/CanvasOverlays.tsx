"use client";

import { useState } from "react";
import type { LinkKind } from "@/common/orchestration/types";
import { ConductorLauncher } from "@/client/features/conduct-sessions";
import type { Point } from "../model/layout";

const CHOICE =
  "rounded-full px-3 py-1 text-[12px] leading-none font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint aria-pressed:bg-fg aria-pressed:text-bg";

const PICK_KINDS: ReadonlyArray<{
  kind: LinkKind;
  label: string;
  hint: string;
}> = [
  { kind: "delegate", label: "맡김", hint: "적은 일을 뒤 세션에 바로 보내요" },
  {
    kind: "report",
    label: "끝나면 보고",
    hint: "앞 세션이 턴을 마치면 마지막 답을 뒤 세션에 넣어요",
  },
  {
    kind: "next",
    label: "끝나면 다음",
    hint: "앞 세션이 턴을 마치면 뒤 세션에 할 말을 보내요",
  },
];

/** Keeps a popover at screen size whatever the canvas zoom is. */
function ScreenSized({
  at,
  zoom,
  children,
}: {
  at: Point;
  zoom: number;
  children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${1 / zoom})`}>
      {children}
    </g>
  );
}

interface ConnectPickerProps {
  at: Point;
  zoom: number;
  fromTitle: string;
  toTitle: string;
  onPick: (kind: LinkKind, prompt: string | null) => void;
  onCancel: () => void;
}

/** Asks which line to draw after a drag in connect mode lands on another box. */
export function ConnectPicker({
  at,
  zoom,
  fromTitle,
  toTitle,
  onPick,
  onCancel,
}: ConnectPickerProps) {
  const [kind, setKind] = useState<LinkKind>("delegate");
  const [prompt, setPrompt] = useState("");
  return (
    <ScreenSized at={at} zoom={zoom}>
      <foreignObject
        width={320}
        height={kind === "report" ? 170 : 240}
        className="overflow-visible"
      >
        <div className="flex flex-col gap-2 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <p className="truncate text-[12px] text-muted">
            {fromTitle} → {toTitle}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PICK_KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={kind === option.kind}
                title={option.hint}
                onClick={() => setKind(option.kind)}
                className={CHOICE}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted">
            {PICK_KINDS.find((option) => option.kind === kind)?.hint}
          </p>
          {kind !== "report" && (
            <textarea
              rows={3}
              autoFocus
              value={prompt}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setPrompt(event.target.value)
              }
              placeholder={kind === "delegate" ? "무엇을 맡길까요?" : "뒤 세션에 보낼 말 · 비우면 앞 세션의 마지막 답을 넣어요"}
              className="resize-none rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={kind === "delegate" && !prompt.trim()}
              onClick={() =>
                onPick(kind, kind !== "report" && prompt.trim() ? prompt : null)
              }
              className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
            >
              {kind === "delegate" ? "맡기기" : "잇기"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3.5 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint"
            >
              취소
            </button>
          </div>
        </div>
      </foreignObject>
    </ScreenSized>
  );
}


interface ConductorPopoverProps {
  at: Point;
  zoom: number;
  worktreePath: string;
  worktreeName: string;
  onClose: () => void;
}

/** Starts a conductor for one worktree right where its frame was right-clicked. */
export function ConductorPopover({ at, zoom, worktreePath, worktreeName, onClose }: ConductorPopoverProps) {
  return (
    <ScreenSized at={at} zoom={zoom}>
      <foreignObject width={380} height={260} className="overflow-visible">
        <div className="rounded-[12px] bg-bg shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <ConductorLauncher worktreePath={worktreePath} scope="worktree" scopeName={worktreeName} onClose={onClose} />
        </div>
      </foreignObject>
    </ScreenSized>
  );
}
