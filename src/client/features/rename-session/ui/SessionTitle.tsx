"use client";

import { TITLE_LIMIT } from "@/common/sessions/limits";
import { useState } from "react";
import type { TitleSource } from "@/common/sessions/types";
import { postAction } from "@/client/shared/api/actions";

interface SessionTitleProps {
  sessionId: string;
  title: string | null;
  titleSource: TitleSource;
  fallback: string;
  textClassName: string;
  onRenamed?: (title: string) => void;
}

interface SavedTitle {
  value: string;
  replaces: string | null;
}

export function SessionTitle({ sessionId, title, titleSource, fallback, textClassName, onRenamed }: SessionTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown until the next poll brings the written title back from the transcript.
  const [saved, setSaved] = useState<SavedTitle | null>(null);

  const pending = saved !== null && saved.replaces === title;
  const shown = pending ? saved.value : (title ?? fallback);
  const source: TitleSource = pending ? "custom" : titleSource;

  const startEditing = () => {
    setError(null);
    setDraft(shown);
  };

  const save = async () => {
    const next = (draft ?? "").replace(/\s+/g, " ").trim();
    if (!next || next === shown) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await postAction({ type: "rename-session", sessionId, title: next });
      setSaved({ value: next, replaces: title });
      setDraft(null);
      onRenamed?.(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
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
          placeholder="세션 제목"
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
        title="세션 제목을 바꿔요. claude --resume 목록에도 같은 제목이 보여요"
        className="shrink-0 text-[12px] text-muted opacity-0 group-hover:opacity-100 hover:text-fg hover:underline focus-visible:opacity-100"
      >
        제목 수정
      </button>
    </span>
  );
}
