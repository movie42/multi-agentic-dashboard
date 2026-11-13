"use client";

import { startTransition, useActionState, useState } from "react";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { AttachButton, AttachmentList } from "@/client/shared/ui/AttachmentControls";
import { appendPaths, useAttachments } from "@/client/shared/lib/useAttachments";
import { useDraft } from "@/client/shared/lib/useDraft";
import { useVoice } from "../model/useVoice";
import { VoiceButton } from "./VoiceButton";

type SendResult = { kind: "idle"; id: number } | { kind: "sent"; id: number } | { kind: "error"; id: number; message: string };
type SendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

interface QuickReplyProps {
  terminalHandle: string;
  working: boolean;
  autoFocus?: boolean;
}

export function QuickReply({ terminalHandle, working, autoFocus = false }: QuickReplyProps) {
  const [text, setText] = useDraft(`quick-reply-draft:${terminalHandle}`);
  const [dismissedId, setDismissedId] = useState(0);
  const [stopping, setStopping] = useState(false);
  const attachments = useAttachments("quick-reply");

  const [result, dispatch, sending] = useActionState(async (previous: SendResult, message: string): Promise<SendResult> => {
    const id = previous.id + 1;
    try {
      await postAction({ type: "send-prompt", terminalHandle, text: message });
      setText("");
      attachments.clear();
      return { kind: "sent", id };
    } catch (error) {
      toastError("quick-reply", error);
      return { kind: "error", id, message: error instanceof Error ? error.message : String(error) };
    }
  }, { kind: "idle", id: 0 });

  const status: SendStatus = sending || stopping ? { kind: "sending" } : result.id === dismissedId ? { kind: "idle" } : result;
  const canSend = (text.trim().length > 0 || attachments.readyPaths.length > 0) && !attachments.uploading && !sending;
  const dismiss = () => setDismissedId(result.id);
  const voice = useVoice(terminalHandle, (transcript) => {
    setText(text.trim() ? `${text.trimEnd()} ${transcript}` : transcript);
    if (!sending) dismiss();
  });

  const addFiles = (files: File[]) => {
    if (!sending) dismiss();
    attachments.addFiles(files);
  };

  const sendWithVoice = async () => {
    if (voice.pending || stopping || sending || attachments.uploading) return;
    setStopping(true);
    const transcript = await voice.stop();
    setStopping(false);
    if (transcript === null) return;
    const body = [text.trim(), transcript].filter(Boolean).join(" ");
    if (!body && attachments.readyPaths.length === 0) return;
    startTransition(() => dispatch(appendPaths(body, attachments.readyPaths)));
  };

  const send = () => {
    if (voice.recording) {
      void sendWithVoice();
      return;
    }
    if (!canSend) return;
    const message = appendPaths(text, attachments.readyPaths);
    startTransition(() => dispatch(message));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    if (!sending) dismiss();
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (event.clipboardData.files.length > 0 && !sending) dismiss();
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
        {voice.recording && (
          <p aria-live="polite" className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
            {voice.transcript || "듣고 있어요…"}
          </p>
        )}
        <div className="flex items-end gap-2">
          <AttachButton onFiles={addFiles} />
          <VoiceButton
            recording={voice.recording}
            pending={voice.pending}
            disabled={sending}
            onToggle={voice.toggle}
          />
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
            onClick={send}
            disabled={voice.recording ? voice.pending || stopping || sending || attachments.uploading : !canSend}
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
