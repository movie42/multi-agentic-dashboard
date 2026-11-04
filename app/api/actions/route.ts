import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { featureCheckInput } from "@/lib/orca/board";
import { runOrca } from "@/lib/orca/cli";
import { startFeatureCheck } from "@/lib/workflow/remoteCheck";
import { actionRequestSchema, type ActionResponse } from "@/common/actions/schema";
import { answerPermission } from "@/lib/permissions/store";
import { ORCA_BUNDLE_ID, readRuntime } from "@/lib/orca/runtime";
import { removeBookmark, saveBookmark } from "@/lib/sessions/bookmarks";
import { renameSession } from "@/lib/sessions/sessionTitle";

const execFileAsync = promisify(execFile);
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
  const parsed = actionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid action" } satisfies ActionResponse, {
      status: 400,
    });
  }
  const body = parsed.data;

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
    } else if (body.type === "close-terminal") {
      await runOrca(["terminal", "close", "--terminal", body.terminalHandle]);
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
    } else if (body.type === "answer-permission") {
      if (!answerPermission(body.requestId, body.answer)) throw new Error("이미 끝난 요청이에요");
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
    } else if (body.type === "open-terminal") {
      await requireAppWindow();
      await runOrca(["terminal", "create", "--worktree", `path:${body.worktreePath}`, "--focus"]);
      await bringOrcaForward();
    } else if (body.type === "rename-session") {
      await renameSession(body.sessionId, body.title.trim());
    } else if (body.type === "bookmark-session") {
      await saveBookmark({ sessionId: body.sessionId, name: body.name.trim(), cwd: body.cwd, memo: body.memo.trim() });
    } else if (body.type === "unbookmark-session") {
      await removeBookmark(body.sessionId);
    } else if (body.type === "check-feature") {
      startFeatureCheck(await featureCheckInput(body.featureId));
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
