"use client";

import { useRef, useState } from "react";
import { postAction, uploadAttachment } from "./actions";

type SendStatus = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

type Attachment =
  | { id: string; name: string; previewUrl: string; kind: "uploading" }
  | { id: string; name: string; previewUrl: string; kind: "ready"; path: string }
  | { id: string; name: string; previewUrl: string; kind: "error"; message: string };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

interface QuickReplyProps {
  terminalHandle: string;
  working: boolean;
}

export function QuickReply({ terminalHandle, working }: QuickReplyProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = attachments.some((attachment) => attachment.kind === "uploading");
  const readyPaths = attachments.flatMap((attachment) => (attachment.kind === "ready" ? [attachment.path] : []));
  const canSend = (text.trim().length > 0 || readyPaths.length > 0) && !uploading && status.kind !== "sending";

  const addFiles = (files: File[]) => {
    const images = files.filter((file) => IMAGE_TYPES.includes(file.type));
    if (images.length < files.length) {
      setStatus({ kind: "error", message: "PNG, JPG, GIF, WEBP 이미지만 붙일 수 있어요" });
    } else if (status.kind !== "sending") {
      setStatus({ kind: "idle" });
    }
    for (const file of images) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setAttachments((current) => [...current, { id, name: file.name, previewUrl, kind: "uploading" }]);
      uploadAttachment(file)
        .then((filePath) => {
          setAttachments((current) =>
            current.map((item) => (item.id === id ? { id, name: item.name, previewUrl, kind: "ready", path: filePath } : item)),
          );
        })
        .catch((error: unknown) => {
          console.error("[quick-reply] upload", error);
          const message = error instanceof Error ? error.message : String(error);
          setAttachments((current) =>
            current.map((item) => (item.id === id ? { id, name: item.name, previewUrl, kind: "error", message } : item)),
          );
        });
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const send = async () => {
    if (!canSend) return;
    const prompt = [text.trim(), ...readyPaths].filter(Boolean).join(" ");
    setStatus({ kind: "sending" });
    try {
      await postAction({ type: "send-prompt", terminalHandle, text: prompt });
      setText("");
      for (const attachment of attachments) URL.revokeObjectURL(attachment.previewUrl);
      setAttachments([]);
      setStatus({ kind: "sent" });
    } catch (error) {
      console.error("[quick-reply]", error);
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
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
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  };

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const placeholder = dragging
    ? "여기에 놓으면 이미지가 붙어요"
    : working
      ? "작업 중이에요 · 보내면 다음 차례로 줄 서요"
      : "빠른 답장 · Enter 보내기, Shift+Enter 줄바꿈";

  return (
    <div className="flex flex-col gap-1">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col gap-2 rounded-[10px] bg-bg px-3 py-2 ${
          dragging
            ? "bg-tint shadow-[inset_0_0_0_1.5px_var(--st-now)]"
            : "shadow-[inset_0_0_0_1px_var(--hair)] focus-within:shadow-[inset_0_0_0_1.5px_var(--faint)]"
        }`}
      >
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                title={attachment.kind === "error" ? `${attachment.name}\n${attachment.message}` : attachment.name}
                className={`group relative size-14 overflow-hidden rounded-md bg-tint-2 ${
                  attachment.kind === "error" ? "shadow-[inset_0_0_0_1.5px_var(--accent)]" : ""
                }`}
              >
                <img
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className={`size-full object-cover ${attachment.kind === "ready" ? "" : "opacity-40"}`}
                />
                {attachment.kind === "uploading" && (
                  <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-fg">올리는 중</span>
                )}
                {attachment.kind === "error" && (
                  <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-accent">실패</span>
                )}
                <button
                  type="button"
                  aria-label={`${attachment.name} 빼기`}
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-fg text-[12px] leading-none text-bg opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="이미지 첨부"
            title="이미지 첨부 · 끌어다 놓거나 붙여넣어도 돼요"
            onClick={() => fileInputRef.current?.click()}
            className="grid size-7 shrink-0 place-items-center rounded-full text-[18px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            onChange={onFileInputChange}
            className="hidden"
          />
          <textarea
            data-quick-reply
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
            {status.kind === "sending" ? "보내는 중" : uploading ? "올리는 중" : "보내기"}
          </button>
        </div>
      </div>
      {status.kind === "sent" && <p className="text-[12px] text-muted">보냈어요. 상태가 곧 바뀌어요.</p>}
      {status.kind === "error" && <p className="text-[12px] text-accent">못 보냈어요: {status.message}</p>}
    </div>
  );
}
