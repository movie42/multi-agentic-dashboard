"use client";

import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { WorktreeSummary } from "@/common/board/types";
import type { LinkKind } from "@/common/orchestration/types";
import type { Point } from "../model/layout";

export const GHOST_ID = "__ghost__";
export const GHOST_W = 264;
const GHOST_H = 72;
const GHOST_OPEN_H = 250;

const CHOICE =
  "rounded-full px-3 py-1 text-[12px] leading-none font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint aria-pressed:bg-fg aria-pressed:text-bg";

const PICK_KINDS: ReadonlyArray<{
  kind: LinkKind;
  label: string;
  hint: string;
}> = [
  { kind: "delegate", label: "맡김", hint: "누가 일을 맡겼는지 기록만 해요" },
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
        height={kind === "next" ? 230 : 170}
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
          {kind === "next" && (
            <textarea
              rows={2}
              value={prompt}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setPrompt(event.target.value)
              }
              placeholder="뒤 세션에 보낼 말 · 비우면 앞 세션의 마지막 답을 넣어요"
              className="resize-none rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                onPick(kind, kind === "next" && prompt.trim() ? prompt : null)
              }
              className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85"
            >
              잇기
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

interface GhostNodeProps {
  at: Point;
  zoom: number;
  worktrees: WorktreeSummary[];
  /** The box a new session would be connected from, when one is selected or was dragged onto the ghost. */
  linkFrom: { id: string; title: string } | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAction: (action: ActionRequest) => Promise<void>;
}

/** '+ 새 세션 끌어 · 잇기': start a session in any worktree and connect it to a box in one go. */
export function GhostNode({
  at,
  zoom,
  worktrees,
  linkFrom,
  open,
  onOpen,
  onClose,
  onAction,
}: GhostNodeProps) {
  const [path, setPath] = useState(
    worktrees.find((worktree) => !worktree.isMain)?.path ??
      worktrees[0]?.path ??
      "",
  );
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"delegate" | "next">("delegate");
  const [sending, setSending] = useState(false);

  const start = async () => {
    if (!path || sending) return;
    setSending(true);
    try {
      await onAction({
        type: "launch-agent",
        worktreePath: path,
        prompt,
        ...(linkFrom ? { link: { from: linkFrom.id, kind } } : {}),
      });
      setPrompt("");
      onClose();
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <foreignObject
        x={at.x}
        y={at.y}
        width={GHOST_W}
        height={GHOST_H}
        data-node={GHOST_ID}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex h-full w-full items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-faint text-[13px] font-semibold text-muted hover:border-fg hover:text-fg"
        >
          + 새 세션 끌어 · 잇기
        </button>
      </foreignObject>
    );
  }
  return (
    <ScreenSized at={at} zoom={zoom}>
      <foreignObject
        width={GHOST_W + 56}
        height={GHOST_OPEN_H}
        data-node={GHOST_ID}
        className="overflow-visible"
      >
        <div className="flex flex-col gap-2 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
          <select
            value={path}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              setPath(event.target.value)
            }
            className="rounded-[8px] bg-tint px-2 py-1.5 text-[13px] outline-none"
          >
            {worktrees.map((worktree) => (
              <option key={worktree.path} value={worktree.path}>
                {worktree.name}
                {worktree.branch && worktree.branch !== worktree.name
                  ? ` · ${worktree.branch}`
                  : ""}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            autoFocus
            value={prompt}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setPrompt(event.target.value)
            }
            placeholder="새 세션에 맡길 일"
            className="resize-none rounded-[8px] bg-tint px-2.5 py-2 text-[13px] outline-none placeholder:text-muted"
          />
          {linkFrom ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="max-w-[140px] truncate text-muted">
                {linkFrom.title}에서
              </span>
              {(["delegate", "next"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className={CHOICE}
                >
                  {option === "delegate" ? "맡김" : "끝나면 다음"}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted">
              상자를 하나 고르거나 잇기 모드에서 상자를 여기로 끌면 바로 이어요.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={sending || !path}
              onClick={() => void start()}
              className="rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
            >
              {sending ? "여는 중" : "세션 열기"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3.5 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint"
            >
              닫기
            </button>
          </div>
        </div>
      </foreignObject>
    </ScreenSized>
  );
}
