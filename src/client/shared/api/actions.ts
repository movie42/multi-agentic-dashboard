import type { ActionRequest, ActionResponse, AttachmentResponse } from "@/common/actions/schema";

export async function postAction(action: ActionRequest): Promise<void> {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const payload = (await response.json()) as ActionResponse;
  if (!payload.ok) throw new Error(payload.error);
}

export async function uploadAttachment(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/attachments", { method: "POST", body: form });
  const payload = (await response.json()) as AttachmentResponse;
  if (!payload.ok) throw new Error(payload.error);
  return payload.path;
}
