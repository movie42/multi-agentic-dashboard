"use client";

import { startTransition, useActionState, useState } from "react";
import { TITLE_LIMIT } from "@/common/sessions/limits";
import type { WorktreeSummary } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

interface WorktreeNameFormProps {
  worktree: WorktreeSummary;
  /** Called with the saved name, or null when the user backs out without saving. */
  onDone: (savedName: string | null) => void;
}

/** Edits the name the board shows for the worktree; the folder and branch keep their names. */
export function WorktreeNameForm({ worktree, onDone }: WorktreeNameFormProps) {
  const [draft, setDraft] = useState(worktree.name);
  const [error, dispatch, saving] = useActionState(async (_previous: string | null, next: string): Promise<string | null> => {
    try {
      await postAction({ type: "rename-worktree", worktreePath: worktree.path, name: next });
      onDone(next);
      return null;
    } catch (saveError) {
      toastError("rename-worktree", saveError);
      return saveError instanceof Error ? saveError.message : String(saveError);
    }
  }, null);

  const save = () => {
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next || next === worktree.name) {
      onDone(null);
      return;
    }
    if (saving) return;
    startTransition(() => dispatch(next));
  };

  return (
    <form
      className="flex flex-col gap-1.5"
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
        aria-label="워크트리 이름"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Escape") onDone(null);
        }}
        className="w-full min-w-0 rounded-md bg-bg px-2 py-1 text-[15px] font-bold shadow-[inset_0_0_0_1.5px_var(--faint)] outline-none"
      />
      <div className="flex items-center gap-1.5">
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 rounded-full bg-fg px-3 py-1 text-[12px] leading-none font-semibold text-bg hover:opacity-85 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="shrink-0 rounded-full px-2 py-1 text-[12px] leading-none text-muted hover:text-fg"
        >
          취소
        </button>
      </div>
      <p className="text-[12px] text-muted">보드에 보이는 이름만 바뀌어요. 폴더와 브랜치는 그대로예요.</p>
      {error && <p className="text-[12px] break-all text-accent">{error}</p>}
    </form>
  );
}
