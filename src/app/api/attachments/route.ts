import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AttachmentResponse } from "@/lib/orca/actions";

const MAX_BYTES = 20 * 1024 * 1024;
const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const ATTACHMENT_DIR = path.join(os.tmpdir(), "agent-control", "attachments");

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "파일이 없어요" } satisfies AttachmentResponse, { status: 400 });
  }
  const extension = EXTENSION[file.type];
  if (!extension) {
    return Response.json({ ok: false, error: "PNG, JPG, GIF, WEBP만 붙일 수 있어요" } satisfies AttachmentResponse, {
      status: 415,
    });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "20MB를 넘는 이미지는 붙일 수 없어요" } satisfies AttachmentResponse, {
      status: 413,
    });
  }

  try {
    await mkdir(ATTACHMENT_DIR, { recursive: true });
    const target = path.join(ATTACHMENT_DIR, `${randomUUID()}.${extension}`);
    await writeFile(target, Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true, path: target } satisfies AttachmentResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[attachments]", message);
    return Response.json({ ok: false, error: message } satisfies AttachmentResponse, { status: 500 });
  }
}
