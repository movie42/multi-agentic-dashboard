import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FolderPickResponse } from "@/common/actions/schema";

const execFileAsync = promisify(execFile);

// Asking the frontmost app to show the dialog keeps it above the dashboard window; osascript's own dialog opens behind it.
const SCRIPT = `tell application (path to frontmost application as text) to POSIX path of (choose folder with prompt "불러올 프로젝트 폴더를 골라 주세요")`;

// The dialog waits on the user, so the timeout only guards against a stuck osascript.
const PICK_TIMEOUT_MS = 10 * 60_000;

function isCancel(error: unknown): boolean {
  return typeof error === "object" && error !== null && "stderr" in error && String(error.stderr).includes("(-128)");
}

export async function POST() {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", SCRIPT], { timeout: PICK_TIMEOUT_MS });
    const picked = stdout.trim().replace(/(.)\/$/, "$1");
    return Response.json({ ok: true, path: picked || null } satisfies FolderPickResponse);
  } catch (error) {
    if (isCancel(error)) return Response.json({ ok: true, path: null } satisfies FolderPickResponse);
    const message = error instanceof Error ? error.message : String(error);
    console.error("[folder-picker]", message);
    return Response.json({ ok: false, error: message } satisfies FolderPickResponse, { status: 500 });
  }
}
