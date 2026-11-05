import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AttachmentResponse } from "@/common/actions/schema";

const MAX_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_DIR = path.join(os.tmpdir(), "agent-control", "attachments");

function safeName(name: string): string {
  const cleaned = path
    .basename(name)
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return cleaned || "file";
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "파일이 없어요" } satisfies AttachmentResponse, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "20MB를 넘는 파일은 붙일 수 없어요" } satisfies AttachmentResponse, {
      status: 413,
    });
  }

  try {
    const directory = path.join(ATTACHMENT_DIR, randomUUID());
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, safeName(file.name));
    await writeFile(target, Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true, path: target } satisfies AttachmentResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[attachments]", message);
    return Response.json({ ok: false, error: message } satisfies AttachmentResponse, { status: 500 });
  }
}
