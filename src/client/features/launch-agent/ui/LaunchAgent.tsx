"use client";

import { startTransition, useActionState, useState } from "react";
import type { WorktreeSummary } from "@/common/orca/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { AttachButton, AttachmentList } from "@/client/shared/ui/AttachmentControls";
import { appendPaths, useAttachments } from "@/client/shared/lib/useAttachments";

type LaunchResult = { kind: "idle" } | { kind: "sent"; where: string } | { kind: "error"; message: string };
type LaunchStatus = LaunchResult | { kind: "sending" };

interface LaunchRequest {
  worktree: WorktreeSummary;
  prompt: string;
}

interface LaunchAgentProps {
  worktrees: WorktreeSummary[];
  showRepo: boolean;
}

function labelOf(worktree: WorktreeSummary, showRepo: boolean): string {
  const name = worktree.branch && worktree.name !== worktree.branch ? `${worktree.name} · ${worktree.branch}` : worktree.name;
  return showRepo ? `${worktree.repo} / ${name}` : name;
}

export function LaunchAgent({ worktrees, showRepo }: LaunchAgentProps) {
  const sorted = [...worktrees].sort((a, b) => a.repo.localeCompare(b.repo) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
  const [chosenPath, setChosenPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const attachments = useAttachments("launch-agent");
  const target = sorted.find((worktree) => worktree.path === chosenPath) ?? sorted[0];

  const [result, dispatch, sending] = useActionState(
    async (_previous: LaunchResult, request: LaunchRequest): Promise<LaunchResult> => {
      try {
        await postAction({ type: "launch-agent", worktreePath: request.worktree.path, prompt: request.prompt });
        setPrompt("");
        attachments.clear();
        return { kind: "sent", where: labelOf(request.worktree, showRepo) };
      } catch (error) {
        toastError("launch-agent", error);
        return { kind: "error", message: error instanceof Error ? error.message : String(error) };
      }
    },
    { kind: "idle" },
  );
  const status: LaunchStatus = sending ? { kind: "sending" } : result;

  const launch = () => {
    if (!target || sending || attachments.uploading) return;
    const request = { worktree: target, prompt: appendPaths(prompt, attachments.readyPaths) };
    startTransition(() => dispatch(request));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    launch();
  };

  if (!target) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        {...attachments.dropzone}
        className={`flex flex-col gap-2 rounded-[10px] bg-tint p-3 ${
          attachments.dragging ? "shadow-[inset_0_0_0_1.5px_var(--st-now)]" : ""
        }`}
      >
        <AttachmentList attachments={attachments.list} onRemove={attachments.remove} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <select
            value={target.path}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setChosenPath(event.target.value)}
            className="min-w-0 rounded-full bg-bg px-3 py-1.5 text-[13px] outline-none sm:max-w-80"
          >
            {sorted.map((worktree) => (
              <option key={worktree.worktreeId} value={worktree.path}>
                {labelOf(worktree, showRepo)}
              </option>
            ))}
          </select>
          <div className="flex flex-1 items-end gap-2">
            <AttachButton onFiles={attachments.addFiles} className="mb-0.5 hover:bg-bg" />
            <textarea
              rows={1}
              value={prompt}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={attachments.onPaste}
              placeholder={
                attachments.dragging
                  ? "여기에 놓으면 파일이 붙어요"
                  : "새 Claude 세션에 보낼 첫 요청 · 비워 두면 빈 세션 · Enter 시작"
              }
              className="field-sizing-content max-h-40 min-h-8 flex-1 resize-none rounded-[8px] bg-bg px-3 py-1.5 text-[14px] leading-relaxed outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="button"
            onClick={launch}
            disabled={sending || attachments.uploading}
            className="shrink-0 rounded-full bg-fg px-3.5 py-1.5 text-[13px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
          >
            {status.kind === "sending" ? "시작하는 중" : attachments.uploading ? "올리는 중" : "새 세션 시작"}
          </button>
        </div>
      </div>
      {attachments.rejected && <p className="text-[12px] text-accent">20MB를 넘는 파일은 붙일 수 없어요</p>}
      {status.kind === "sent" && (
        <p className="text-[12px] text-muted">{status.where}에서 새 세션을 열었어요. 몇 초 안에 카드로 나타나요.</p>
      )}
      {status.kind === "error" && <p className="text-[12px] text-accent">시작하지 못했어요: {status.message}</p>}
    </div>
  );
}
