"use client";

import { useState } from "react";
import { postAction } from "@/client/shared/api/actions";
import { AttachButton, AttachmentList } from "@/client/features/attach-files";
import { appendPaths, useAttachments } from "@/client/features/attach-files";

type SendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

interface QuickReplyProps {
  terminalHandle: string;
  working: boolean;
  autoFocus?: boolean;
}

export function QuickReply({ terminalHandle, working, autoFocus = false }: QuickReplyProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });
  const attachments = useAttachments("quick-reply");

  const canSend = (text.trim().length > 0 || attachments.readyPaths.length > 0) && !attachments.uploading && status.kind !== "sending";

  const addFiles = (files: File[]) => {
    if (status.kind !== "sending") setStatus({ kind: "idle" });
    attachments.addFiles(files);
  };

  const send = async () => {
    if (!canSend) return;
    setStatus({ kind: "sending" });
    try {
      await postAction({
        type: "send-prompt",
        terminalHandle,
        text: appendPaths(text, attachments.readyPaths),
      });
      setText("");
      attachments.clear();
      setStatus({ kind: "sent" });
    } catch (error) {
      console.error("[quick-reply]", error);
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void send();
  };

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    if (status.kind !== "sending") setStatus({ kind: "idle" });
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (event.clipboardData.files.length > 0 && status.kind !== "sending") setStatus({ kind: "idle" });
    attachments.onPaste(event);
  };

  const placeholder = attachments.dragging
    ? "여기에 놓으면 파일이 붙어요"
    : working
      ? "작업 중이에요 · 보내면 다음 차례로 줄 서요"
      : "빠른 답장 · Enter 보내기, Shift+Enter 줄바꿈";

  return (
    <div className="flex flex-col gap-1">
      <div
        {...attachments.dropzone}
        className={`flex flex-col gap-2 rounded-[10px] bg-bg px-3 py-2 ${
          attachments.dragging
            ? "bg-tint shadow-[inset_0_0_0_1.5px_var(--st-now)]"
            : "shadow-[inset_0_0_0_1px_var(--hair)] focus-within:shadow-[inset_0_0_0_1.5px_var(--faint)]"
        }`}
      >
        <AttachmentList attachments={attachments.list} onRemove={attachments.remove} />
        <div className="flex items-end gap-2">
          <AttachButton onFiles={addFiles} />
          <textarea
            data-quick-reply
            autoFocus={autoFocus}
            rows={1}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="shrink-0 rounded-full bg-fg px-3 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
          >
            {status.kind === "sending" ? "보내는 중" : attachments.uploading ? "올리는 중" : "보내기"}
          </button>
        </div>
      </div>
      {attachments.rejected && <p className="text-[12px] text-accent">20MB를 넘는 파일은 붙일 수 없어요</p>}
      {status.kind === "sent" && <p className="text-[12px] text-muted">보냈어요. 상태가 곧 바뀌어요.</p>}
      {status.kind === "error" && <p className="text-[12px] text-accent">못 보냈어요: {status.message}</p>}
    </div>
  );
}
