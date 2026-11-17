"use client";

import { useQuery } from "@tanstack/react-query";
import { shortSha, type BranchStatusResponse, type ProjectCommand } from "@/common/appStatus/types";
import type { WorktreeSummary } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { readJson } from "@/client/shared/api/json";
import { toastError, useToastStore } from "@/client/shared/model/toastStore";
import { Modal } from "@/client/shared/ui/Modal";
import { PendingButton } from "@/client/shared/ui/PendingButton";
import { Spinner } from "@/client/shared/ui/Spinner";

async function fetchBranchStatus(worktreePath: string) {
  const payload = await readJson<BranchStatusResponse>(await fetch(`/api/branch-status?path=${encodeURIComponent(worktreePath)}`));
  if (!payload.ok) throw new Error(payload.error);
  return payload.status;
}

interface RunCommandDialogProps {
  worktree: WorktreeSummary;
  command: ProjectCommand;
  onClose: () => void;
}

export function RunCommandDialog({ worktree, command, onClose }: RunCommandDialogProps) {
  const branch = useQuery({ queryKey: ["branch-status", worktree.path], queryFn: () => fetchBranchStatus(worktree.path), staleTime: 0 });
  const status = branch.data;

  const run = async () => {
    try {
      await postAction({ type: "run-project-command", worktreePath: worktree.path, projectPath: worktree.projectPath, name: command.name });
      useToastStore.getState().show(`${worktree.name}에서 '${command.name}'을 셸 터미널 상자로 돌리기 시작했어요.`);
      onClose();
    } catch (error) {
      toastError("run-project-command", error, { worktree: worktree.path, name: command.name });
    }
  };

  return (
    <Modal label={`${command.name} 실행 확인`} onClose={onClose}>
      <h2 className="text-[18px] font-bold">{command.name} 실행</h2>
      <div className="flex flex-col gap-2 text-[14px] leading-relaxed">
        {branch.isPending ? (
          <p className="flex items-center gap-1.5 text-muted">
            <Spinner />
            브랜치를 확인하는 중
          </p>
        ) : status ? (
          <p>
            <span className="font-semibold">{worktree.name}</span> 워크트리의{" "}
            <span className="font-mono font-semibold">{status.branch ?? shortSha(status.commit)}</span> 브랜치 코드로 돌려요.{" "}
            {status.behind === null ? (
              <span className="text-muted">main과 비교할 수 없어요.</span>
            ) : status.behind === 0 ? (
              <span className="text-muted">main의 커밋을 모두 갖고 있어요.</span>
            ) : (
              <span className="font-semibold text-ask">main보다 {status.behind}커밋 뒤처져 있어요.</span>
            )}
          </p>
        ) : (
          <p className="text-accent">브랜치를 확인하지 못했어요. 그래도 돌릴 수 있어요.</p>
        )}
        <pre className="overflow-x-auto rounded-[8px] bg-tint px-3 py-2 font-mono text-[13px]">{command.command}</pre>
        <p className="text-[12px] text-muted">새 셸 터미널 상자에서 돌고, 끝난 뒤에도 상자가 남아요.</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-[13px] text-muted hover:text-fg">
          취소
        </button>
        <PendingButton onRun={run} className="rounded-full bg-fg px-3 py-1 text-[13px] font-semibold text-bg hover:opacity-85">
          실행
        </PendingButton>
      </div>
    </Modal>
  );
}
