"use client";

import { TITLE_LIMIT } from "@/common/sessions/limits";
import { startTransition, useActionState, useState } from "react";
import type { TitleSource } from "@/common/sessions/types";
import type { ActionRequest } from "@/common/actions/schema";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

/** A Claude session's title lands in its transcript; a shell terminal's name is kept by the dashboard. */
export type RenameTarget = { kind: "session"; sessionId: string } | { kind: "terminal"; terminalHandle: string };

function renameAction(target: RenameTarget, title: string): ActionRequest {
  return target.kind === "session"
    ? { type: "rename-session", sessionId: target.sessionId, title }
    : { type: "rename-terminal", terminalHandle: target.terminalHandle, title };
}

const COPY = {
  session: {
    placeholder: "세션 제목",
    button: "제목 수정",
    hint: "세션 제목을 바꿔요. claude --resume 목록에도 같은 제목이 보여요",
  },
  terminal: {
    placeholder: "터미널 별칭",
    button: "별칭 지정",
    hint: "이 터미널에 알아보기 쉬운 이름을 붙여요",
  },
} as const;

interface SessionTitleProps {
  target: RenameTarget;
  title: string | null;
  titleSource: TitleSource;
  fallback: string;
  textClassName: string;
  onRenamed?: (title: string) => void;
}

interface SaveResult {
  id: number;
  error: string | null;
}

interface SavedTitle {
  value: string;
  replaces: string | null;
}

export function SessionTitle({ target, title, titleSource, fallback, textClassName, onRenamed }: SessionTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState(0);
  // Shown until the next poll brings the written title back from the transcript.
  const [saved, setSaved] = useState<SavedTitle | null>(null);

  const pending = saved !== null && saved.replaces === title;
  const shown = pending ? saved.value : (title ?? fallback);
  const source: TitleSource = pending ? "custom" : titleSource;

  const [result, dispatch, saving] = useActionState(async (previous: SaveResult, next: string): Promise<SaveResult> => {
    const id = previous.id + 1;
    try {
      await postAction(renameAction(target, next));
      setSaved({ value: next, replaces: title });
      setDraft(null);
      onRenamed?.(next);
      return { id, error: null };
    } catch (saveError) {
      toastError(renameAction(target, next).type, saveError);
      return { id, error: saveError instanceof Error ? saveError.message : String(saveError) };
    }
  }, { id: 0, error: null });
  const error = result.id === dismissedId ? null : result.error;

  const startEditing = () => {
    setDismissedId(result.id);
    // An unnamed terminal shows a generic fallback that is not worth editing from.
    setDraft(target.kind === "terminal" && source === "none" ? "" : shown);
  };

  const save = () => {
    const next = (draft ?? "").replace(/\s+/g, " ").trim();
    if (!next || next === shown) {
      setDraft(null);
      return;
    }
    if (saving) return;
    startTransition(() => dispatch(next));
  };

  if (draft !== null) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-1.5"
        onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          save();
        }}
      >
        <input
          autoFocus
          value={draft}
          maxLength={TITLE_LIMIT}
          disabled={saving}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") setDraft(null);
          }}
          placeholder={COPY[target.kind].placeholder}
          className={`min-w-0 flex-1 rounded-md bg-bg px-2 py-1 outline-none shadow-[inset_0_0_0_1.5px_var(--faint)] ${textClassName}`}
        />
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 rounded-full bg-fg px-3 py-1 text-[12px] leading-none font-semibold text-bg hover:opacity-85 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="shrink-0 rounded-full px-2 py-1 text-[12px] leading-none text-muted hover:text-fg"
        >
          취소
        </button>
        {error && <span className="shrink-0 text-[12px] text-accent">{error}</span>}
      </form>
    );
  }

  return (
    <span className="group flex min-w-0 flex-1 items-center gap-2">
      <span className={`truncate ${textClassName}`} title={shown}>
        {shown}
      </span>
      {source === "ai" && <span className="shrink-0 text-[11px] text-muted">자동</span>}
      <button
        type="button"
        onClick={startEditing}
        title={COPY[target.kind].hint}
        className="shrink-0 text-[12px] text-muted opacity-0 group-hover:opacity-100 hover:text-fg hover:underline focus-visible:opacity-100"
      >
        {COPY[target.kind].button}
      </button>
    </span>
  );
}
