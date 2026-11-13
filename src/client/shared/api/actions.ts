import type { ActionRequest, ActionResponse, AttachmentResponse, VoiceReadResponse, VoiceToggleResponse } from "@/common/actions/schema";
import { readJson } from "./json";

export async function postAction(action: ActionRequest): Promise<void> {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  const payload = await readJson<ActionResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
}

export async function toggleVoice(
  terminalHandle: string,
  intent: "toggle" | "stop" = "toggle",
): Promise<{ recording: true } | { recording: false; transcript: string }> {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "toggle-voice", terminalHandle, intent } satisfies ActionRequest),
  });
  const payload = await readJson<VoiceToggleResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.recording ? { recording: true } : { recording: false, transcript: payload.transcript };
}

export async function readVoice(terminalHandle: string): Promise<{ recording: boolean; transcript: string }> {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "read-voice", terminalHandle } satisfies ActionRequest),
  });
  const payload = await readJson<VoiceReadResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return { recording: payload.recording, transcript: payload.transcript };
}

export async function uploadAttachment(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/attachments", { method: "POST", body: form });
  const payload = await readJson<AttachmentResponse>(response);
  if (!payload.ok) throw new Error(payload.error);
  return payload.path;
}
