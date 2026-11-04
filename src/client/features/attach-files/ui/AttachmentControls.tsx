"use client";

import { useRef } from "react";
import type { Attachment } from "../model/useAttachments";

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          title={attachment.kind === "error" ? `${attachment.name}\n${attachment.message}` : attachment.name}
          className={`group relative h-14 overflow-hidden rounded-md bg-tint-2 ${
            attachment.previewUrl ? "w-14" : "w-36"
          } ${attachment.kind === "error" ? "shadow-[inset_0_0_0_1.5px_var(--accent)]" : ""}`}
        >
          {attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className={`size-full object-cover ${attachment.kind === "ready" ? "" : "opacity-40"}`}
            />
          ) : (
            <FileChip name={attachment.name} dimmed={attachment.kind !== "ready"} />
          )}
          {attachment.kind === "uploading" && (
            <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-fg">올리는 중</span>
          )}
          {attachment.kind === "error" && (
            <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-accent">실패</span>
          )}
          <button
            type="button"
            aria-label={`${attachment.name} 빼기`}
            onClick={() => onRemove(attachment.id)}
            className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-fg text-[12px] leading-none text-bg opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

interface FileChipProps {
  name: string;
  dimmed: boolean;
}

function FileChip({ name, dimmed }: FileChipProps) {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
  return (
    <div className={`flex size-full flex-col justify-center gap-0.5 px-2.5 ${dimmed ? "opacity-40" : ""}`}>
      <span className="truncate text-[11px] font-semibold text-muted">{extension}</span>
      <span className="truncate text-[12px] text-fg">{name}</span>
    </div>
  );
}

interface AttachButtonProps {
  onFiles: (files: File[]) => void;
  className?: string;
}

export function AttachButton({ onFiles, className = "" }: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  return (
    <>
      <button
        type="button"
        aria-label="파일 첨부"
        title="파일 첨부 · 끌어다 놓거나 붙여넣어도 돼요"
        onClick={() => inputRef.current?.click()}
        className={`grid size-7 shrink-0 place-items-center rounded-full text-[18px] leading-none text-muted hover:bg-tint-2 hover:text-fg ${className}`}
      >
        +
      </button>
      <input ref={inputRef} type="file" multiple onChange={onChange} className="hidden" />
    </>
  );
}
