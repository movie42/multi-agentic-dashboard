"use client";

import { useState } from "react";
import type { SessionBookmark } from "@/lib/sessions/types";
import { type BookmarkTarget, useSessionBookmark } from "../model/useSessionBookmark";

const MEMO_LIMIT = 500;
const NAME_LIMIT = 100;

interface BookmarkProps {
  target: BookmarkTarget;
  onChanged?: (bookmark: SessionBookmark | null) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function bookmarkTarget(
  sessionId: string,
  title: string,
  cwd: string | null,
  bookmark: SessionBookmark | null,
): BookmarkTarget {
  const name = title.replace(/\s+/g, " ").trim().slice(0, NAME_LIMIT) || sessionId;
  return { sessionId, name, cwd, bookmark };
}

export function BookmarkStar({ target, onChanged }: BookmarkProps) {
  const { bookmark, save, remove } = useSessionBookmark(target);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<SessionBookmark | null>) => {
    setSaving(true);
    setError(null);
    try {
      const bookmark = await task();
      onChanged?.(bookmark);
    } catch (runError) {
      console.error("[bookmark]", runError);
      setError(errorText(runError));
    } finally {
      setSaving(false);
    }
  };

  const removeNow = () =>
    run(async () => {
      setConfirming(false);
      await remove();
      return null;
    });

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-2 text-[12px]">
        <span className="text-muted">메모도 지워져요</span>
        <button type="button" onClick={removeNow} className="font-semibold text-accent hover:underline">
          해제
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-muted hover:text-fg">
          취소
        </button>
      </span>
    );
  }

  const label = bookmark ? "북마크 해제" : target.cwd ? "북마크" : "세션 폴더를 몰라 북마크할 수 없어요";
  return (
    <>
      {error && <span className="shrink-0 text-[12px] text-accent">{error}</span>}
      <button
        type="button"
        aria-pressed={bookmark !== null}
        aria-label={label}
        title={label}
        disabled={saving || (!bookmark && !target.cwd)}
        onClick={() => {
          if (!bookmark) run(() => save(""));
          else if (bookmark.memo) setConfirming(true);
          else removeNow();
        }}
        className={`shrink-0 text-[17px] leading-none disabled:opacity-40 ${
          bookmark ? "text-fg" : "text-muted hover:text-fg"
        }`}
      >
        {bookmark ? "★" : "☆"}
      </button>
    </>
  );
}

export function BookmarkMemo({ target, onChanged }: BookmarkProps) {
  const { bookmark, save } = useSessionBookmark(target);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bookmark) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await save((draft ?? "").trim());
      onChanged?.(saved);
      setDraft(null);
    } catch (saveError) {
      console.error("[bookmark] memo", saveError);
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (draft !== null) {
    return (
      <form
        className="flex min-w-0 items-center gap-1.5 text-[13px]"
        onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value.slice(0, MEMO_LIMIT))}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") setDraft(null);
          }}
          placeholder="북마크 메모 (비워도 돼요)"
          className="min-w-0 flex-1 rounded-full bg-tint-2 px-3.5 py-1.5 outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-fg px-3.5 py-1.5 leading-none font-semibold text-bg hover:opacity-85"
        >
          {saving ? "저장 중…" : "메모 저장"}
        </button>
        <button type="button" onClick={() => setDraft(null)} className="text-muted hover:text-fg">
          취소
        </button>
        {error && <span className="text-accent">{error}</span>}
      </form>
    );
  }

  return (
    <p className="text-[13px] leading-relaxed text-muted">
      ★ 북마크됨
      {bookmark.memo && (
        <>
          {" · "}
          <span className="text-fg">{bookmark.memo}</span>
        </>
      )}{" "}
      <button
        type="button"
        onClick={() => setDraft(bookmark.memo)}
        className="underline decoration-faint underline-offset-[3px] hover:text-fg"
      >
        {bookmark.memo ? "메모 고치기" : "메모 추가"}
      </button>
    </p>
  );
}

interface BookmarkMarkProps {
  target: BookmarkTarget;
}

export function BookmarkMark({ target }: BookmarkMarkProps) {
  const { bookmark } = useSessionBookmark(target);
  if (!bookmark) return null;
  return (
    <span className="shrink-0 text-[15px] leading-none text-fg" title={bookmark.memo ? `북마크 · ${bookmark.memo}` : "북마크"}>
      ★
    </span>
  );
}
