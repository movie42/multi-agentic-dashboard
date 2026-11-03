import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { runOrca } from "@/lib/orca/cli";
import type { ActionRequest, ActionResponse } from "@/lib/orca/actions";
import { ORCA_BUNDLE_ID, readRuntime } from "@/lib/orca/runtime";

const execFileAsync = promisify(execFile);
const MAX_PROMPT = 8000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isActionRequest(value: unknown): value is ActionRequest {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const body = value as Record<string, unknown>;
  if (body.type === "open-artifact") {
    return (
      typeof body.target === "string" &&
      (body.via === "system" || body.via === "orca") &&
      typeof body.worktreePath === "string"
    );
  }
  if (body.type === "focus-terminal") {
    return typeof body.terminalHandle === "string";
  }
  if (body.type === "send-prompt") {
    return (
      typeof body.terminalHandle === "string" &&
      typeof body.text === "string" &&
      body.text.trim().length > 0 &&
      body.text.length <= MAX_PROMPT
    );
  }
  if (body.type === "choose-option") {
    return (
      typeof body.terminalHandle === "string" &&
      typeof body.option === "number" &&
      Number.isInteger(body.option) &&
      body.option >= 1 &&
      body.option <= 9
    );
  }
  if (body.type === "launch-agent") {
    return (
      typeof body.worktreePath === "string" &&
      path.isAbsolute(body.worktreePath) &&
      typeof body.prompt === "string" &&
      body.prompt.length <= MAX_PROMPT
    );
  }
  if (body.type === "resume-session") {
    return (
      typeof body.sessionId === "string" &&
      SESSION_ID.test(body.sessionId) &&
      typeof body.cwd === "string" &&
      path.isAbsolute(body.cwd) &&
      typeof body.title === "string"
    );
  }
  return false;
}

async function resolveTarget(target: string): Promise<{ url: string; filePath: string | null }> {
  if (/^https?:\/\//.test(target)) return { url: target, filePath: null };
  if (!path.isAbsolute(target)) throw new Error("target must be an absolute path or http(s) URL");
  const info = await stat(target);
  if (!info.isFile()) throw new Error("target is not a file");
  return { url: pathToFileURL(target).href, filePath: target };
}

const HEADLESS_ERROR = "헤드리스 모드에는 Orca 창이 없어요. 사이드바에서 앱 모드로 바꿔 주세요.";

async function requireAppWindow() {
  if ((await readRuntime()).mode === "headless") throw new Error(HEADLESS_ERROR);
}

async function bringOrcaForward() {
  if ((await readRuntime()).mode === "headless") return;
  await execFileAsync("open", ["-b", ORCA_BUNDLE_ID]);
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isActionRequest(body)) {
    return Response.json({ ok: false, error: "invalid action" } satisfies ActionResponse, {
      status: 400,
    });
  }

  try {
    if (body.type === "open-artifact") {
      const { url, filePath } = await resolveTarget(body.target);
      if (body.via === "system") {
        await execFileAsync("open", [filePath ?? url]);
      } else {
        await requireAppWindow();
        await runOrca(["tab", "create", "--url", url, "--worktree", `path:${body.worktreePath}`]);
        await bringOrcaForward();
      }
    } else if (body.type === "focus-terminal") {
      await requireAppWindow();
      await runOrca(["terminal", "switch", "--terminal", body.terminalHandle]);
      await bringOrcaForward();
    } else if (body.type === "send-prompt") {
      await runOrca([
        "terminal",
        "send",
        "--terminal",
        body.terminalHandle,
        "--text",
        body.text,
        "--enter",
        "--wait-submit",
        "3",
      ]);
    } else if (body.type === "choose-option") {
      await runOrca(["terminal", "send", "--terminal", body.terminalHandle, "--text", String(body.option)]);
    } else if (body.type === "launch-agent") {
      const prompt = body.prompt.trim();
      await runOrca([
        "agent",
        "launch",
        "--agent",
        "claude",
        "--worktree",
        `path:${body.worktreePath}`,
        "--surface",
        "terminal",
        ...(prompt ? ["--prompt", prompt] : []),
      ]);
    } else {
      const info = await stat(body.cwd);
      if (!info.isDirectory()) throw new Error("session folder no longer exists");
      await runOrca([
        "terminal",
        "create",
        "--worktree",
        `path:${body.cwd}`,
        "--title",
        body.title.slice(0, 60),
        "--command",
        `claude --resume ${body.sessionId}`,
        "--focus",
      ]);
      await bringOrcaForward();
    }
    return Response.json({ ok: true } satisfies ActionResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[actions]", body.type, message);
    return Response.json({ ok: false, error: message } satisfies ActionResponse, {
      status: 500,
    });
  }
}
