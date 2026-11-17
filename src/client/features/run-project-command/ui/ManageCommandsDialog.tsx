"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COMMAND_REQUEST_LIMIT, type CommandProposal, type ProjectCommand, type ProjectCommandsEntry } from "@/common/appStatus/types";
import type { WorktreeSummary } from "@/common/board/types";
import { projectCommandsKey, proposeProjectCommands, saveProjectCommands, useProjectCommands } from "@/client/entities/project-commands";
import { Modal } from "@/client/shared/ui/Modal";
import { PendingButton } from "@/client/shared/ui/PendingButton";
import { Spinner } from "@/client/shared/ui/Spinner";

type Revision = { kind: "none" } | { kind: "thinking" } | { kind: "ready"; proposals: CommandProposal[] } | { kind: "failed"; message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function changeOf(proposal: CommandProposal, current: ProjectCommand[]): "new" | "changed" | null {
  const saved = current.find((command) => command.name === proposal.name);
  if (!saved) return "new";
  return saved.command === proposal.command ? null : "changed";
}

interface ReviewProps {
  proposals: CommandProposal[];
  current: ProjectCommand[];
  onSave: (commands: ProjectCommand[]) => Promise<void>;
  onCancel: () => void;
}

function Review({ proposals, current, onSave, onCancel }: ReviewProps) {
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const removed = current.filter((command) => !proposals.some((proposal) => proposal.name === command.name));
  const chosen = proposals.filter((proposal) => !unchecked.has(proposal.name));
  const toggle = (name: string) =>
    setUnchecked((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      {proposals.length === 0 ? (
        <p className="text-[14px] text-muted">에이전트가 버튼으로 둘 명령을 찾지 못했어요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {proposals.map((proposal) => {
            const change = changeOf(proposal, current);
            return (
              <li key={proposal.name}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-tint">
                  <input type="checkbox" checked={!unchecked.has(proposal.name)} onChange={() => toggle(proposal.name)} className="mt-1" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[14px] font-semibold">
                      {proposal.name}
                      {change === "new" && current.length > 0 && <span className="text-[11px] text-now">새로</span>}
                      {change === "changed" && <span className="text-[11px] text-ask">바뀜</span>}
                    </span>
                    <code className="font-mono text-[12px] break-all">{proposal.command}</code>
                    {proposal.why && <span className="text-[12px] text-muted">{proposal.why}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {removed.length > 0 && (
        <p className="text-[12px] text-muted">
          저장하면 빠지는 명령: <span className="font-semibold text-ask">{removed.map((command) => command.name).join(", ")}</span>
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1 text-[13px] text-muted hover:text-fg">
          취소
        </button>
        <PendingButton
          onRun={() => onSave(chosen.map(({ name, command }) => ({ name, command })))}
          disabled={chosen.length === 0 && removed.length === 0}
          className="rounded-full bg-fg px-3 py-1 text-[13px] font-semibold text-bg hover:opacity-85 disabled:opacity-40"
        >
          체크한 {chosen.length}개 저장
        </PendingButton>
      </div>
    </div>
  );
}

interface ManageCommandsDialogProps {
  worktree: WorktreeSummary;
  mode: "register" | "edit";
  onClose: () => void;
}

export function ManageCommandsDialog({ worktree, mode, onClose }: ManageCommandsDialogProps) {
  const queryClient = useQueryClient();
  const current = useProjectCommands(worktree.projectPath);
  const proposal = useQuery({
    queryKey: ["command-proposal", worktree.projectPath],
    queryFn: () => proposeProjectCommands(worktree.projectPath, null),
    enabled: mode === "register",
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [request, setRequest] = useState("");
  const [revision, setRevision] = useState<Revision>({ kind: "none" });
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (commands: ProjectCommand[]) => {
    setSaveError(null);
    try {
      queryClient.setQueryData<ProjectCommandsEntry[]>(projectCommandsKey, await saveProjectCommands(worktree.projectPath, commands));
      onClose();
    } catch (error) {
      console.error("[project-commands] save", worktree.projectPath, error);
      setSaveError(messageOf(error));
    }
  };

  const revise = async () => {
    const text = request.trim();
    if (!text) return;
    setRevision({ kind: "thinking" });
    try {
      setRevision({ kind: "ready", proposals: await proposeProjectCommands(worktree.projectPath, text) });
    } catch (error) {
      console.error("[project-commands] revise", worktree.projectPath, error);
      setRevision({ kind: "failed", message: messageOf(error) });
    }
  };

  const thinking = (
    <p className="flex items-center gap-2 text-[14px] text-muted">
      <Spinner />
      에이전트가 저장소를 읽고 명령을 찾는 중이에요. 1~2분 걸릴 수 있어요.
    </p>
  );

  return (
    <Modal label={mode === "register" ? "명령 등록하기" : "명령 수정하기"} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-bold">{mode === "register" ? "명령 등록하기" : "명령 수정하기"}</h2>
        <p className="text-[13px] text-muted">
          <span className="font-semibold">{worktree.repo}</span> 프로젝트에 저장돼요. 이 프로젝트의 모든 워크트리에서 같은 버튼이 보여요.
        </p>
      </div>

      {mode === "register" ? (
        proposal.isPending ? (
          thinking
        ) : proposal.isError ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] break-all text-accent">명령을 찾지 못했어요: {messageOf(proposal.error)}</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => void proposal.refetch()} className="rounded-full bg-tint px-3 py-1 text-[13px] font-semibold hover:bg-tint-2">
                다시 찾기
              </button>
            </div>
          </div>
        ) : (
          <Review proposals={proposal.data} current={current} onSave={save} onCancel={onClose} />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {revision.kind !== "ready" && (
            <>
              <ul className="flex flex-col gap-1 rounded-[8px] bg-tint px-3 py-2">
                {current.length === 0 && <li className="text-[13px] text-muted">등록된 명령이 없어요.</li>}
                {current.map((command) => (
                  <li key={command.name} className="flex items-baseline gap-2 text-[13px]">
                    <span className="shrink-0 font-semibold">{command.name}</span>
                    <code className="min-w-0 truncate font-mono text-[12px] text-muted">{command.command}</code>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-2"
                onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  void revise();
                }}
              >
                <input
                  autoFocus
                  value={request}
                  maxLength={COMMAND_REQUEST_LIMIT}
                  disabled={revision.kind === "thinking"}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setRequest(event.target.value)}
                  placeholder="예: 재설치 명령에 캐시 지우기를 붙여 줘"
                  className="min-w-0 flex-1 rounded-[8px] bg-tint px-3 py-2 text-[14px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--focus)]"
                />
                <button
                  type="submit"
                  disabled={revision.kind === "thinking" || request.trim().length === 0}
                  className="shrink-0 rounded-full bg-fg px-3 py-1 text-[13px] font-semibold text-bg hover:opacity-85 disabled:opacity-40"
                >
                  고쳐 달라고 하기
                </button>
              </form>
              {revision.kind === "thinking" && thinking}
              {revision.kind === "failed" && <p className="text-[14px] break-all text-accent">고치지 못했어요: {revision.message}</p>}
            </>
          )}
          {revision.kind === "ready" && (
            <Review proposals={revision.proposals} current={current} onSave={save} onCancel={() => setRevision({ kind: "none" })} />
          )}
        </div>
      )}
      {saveError && <p className="text-[13px] break-all text-accent">저장하지 못했어요: {saveError}</p>}
    </Modal>
  );
}
