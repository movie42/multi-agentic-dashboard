"use client";

import { useState } from "react";
import type { WorktreeSummary } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { Spinner } from "@/client/shared/ui/Spinner";

type Step =
  | { kind: "confirm" }
  | { kind: "removing"; force: boolean }
  | { kind: "failed"; message: string }
  | { kind: "removed" };

interface RemoveWorktreeProps {
  worktree: WorktreeSummary;
  /** Agent sessions attached to the worktree; removal closes their terminals. */
  sessionCount: number;
  /** Called when the user backs out of the confirm step. */
  onCancel: () => void;
}

/** The confirm-and-remove step; whoever offers 워크트리 삭제 mounts it when the user picks that action. */
export function RemoveWorktree({ worktree, sessionCount, onCancel }: RemoveWorktreeProps) {
  const [step, setStep] = useState<Step>({ kind: "confirm" });

  if (worktree.isMain) return null;

  const remove = async (force: boolean) => {
    setStep({ kind: "removing", force });
    try {
      await postAction({ type: "remove-worktree", worktreePath: worktree.path, force });
      setStep({ kind: "removed" });
    } catch (error) {
      console.error("[remove-worktree]", worktree.path, error);
      setStep({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };

  if (step.kind === "removing") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
        <Spinner />
        {step.force ? "강제로 지우는 중" : "지우는 중"}
      </p>
    );
  }

  if (step.kind === "removed") {
    return <p className="mt-3 text-[12px] text-muted">지웠어요. 몇 초 안에 보드에서 사라져요.</p>;
  }

  const failed = step.kind === "failed";
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-[8px] bg-tint p-2.5 text-[12px]">
      {failed ? (
        <p className="break-all text-accent">지우지 못했어요: {step.message}</p>
      ) : (
        <p className="leading-relaxed">
          <span className="font-mono">{worktree.name}</span> 폴더를 지울까요? 브랜치는 남아요.
          {sessionCount > 0 && <span className="block text-ask">열린 세션 {sessionCount}개도 함께 닫혀요.</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void remove(failed)}
          title={failed ? "커밋하지 않은 변경이 있어도 지워요" : undefined}
          className="rounded-full bg-accent px-2.5 py-0.5 font-semibold text-accent-ink hover:opacity-85"
        >
          {failed ? "강제로 삭제" : "삭제"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2.5 py-0.5 text-muted hover:text-fg"
        >
          취소
        </button>
      </div>
    </div>
  );
}
