"use client";

import { useState } from "react";
import { uploadAttachment } from "./actions";

interface AttachmentBase {
  id: string;
  name: string;
  previewUrl: string | null;
}

export type Attachment =
  | (AttachmentBase & { kind: "uploading" })
  | (AttachmentBase & { kind: "ready"; path: string })
  | (AttachmentBase & { kind: "error"; message: string });

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function useAttachments(logTag: string) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);

  const uploading = attachments.some((attachment) => attachment.kind === "uploading");
  const readyPaths = attachments.flatMap((attachment) => (attachment.kind === "ready" ? [attachment.path] : []));

  const addFiles = (files: File[]) => {
    const accepted = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    setRejected(accepted.length < files.length);
    for (const file of accepted) {
      const id = crypto.randomUUID();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      setAttachments((current) => [...current, { id, name: file.name, previewUrl, kind: "uploading" }]);
      uploadAttachment(file)
        .then((filePath) => {
          setAttachments((current) =>
            current.map((item) =>
              item.id === id ? { id, name: item.name, previewUrl, kind: "ready", path: filePath } : item,
            ),
          );
        })
        .catch((error: unknown) => {
          console.error(`[${logTag}] upload`, error);
          const message = error instanceof Error ? error.message : String(error);
          setAttachments((current) =>
            current.map((item) => (item.id === id ? { id, name: item.name, previewUrl, kind: "error", message } : item)),
          );
        });
    }
  };

  const revoke = (attachment: Attachment) => {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  };

  const remove = (id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) revoke(target);
      return current.filter((item) => item.id !== id);
    });
  };

  const clear = () => {
    for (const attachment of attachments) revoke(attachment);
    setAttachments([]);
    setRejected(false);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  };

  const onDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  };

  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  return {
    list: attachments,
    uploading,
    readyPaths,
    dragging,
    rejected,
    addFiles,
    remove,
    clear,
    onPaste,
    dropzone: { onDragOver, onDragLeave, onDrop },
  };
}

export function appendPaths(text: string, paths: string[]): string {
  return [text.trim(), ...paths].filter(Boolean).join(" ");
}
