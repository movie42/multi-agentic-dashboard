import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { actionRequestSchema, type ActionResponse } from "@/common/actions/schema";
import { services } from "@/server/container";

const execFileAsync = promisify(execFile);
async function resolveTarget(target: string): Promise<{ url: string; filePath: string | null }> {
  if (/^https?:\/\//.test(target)) return { url: target, filePath: null };
  if (!path.isAbsolute(target)) throw new Error("target must be an absolute path or http(s) URL");
  const info = await stat(target);
  if (!info.isFile()) throw new Error("target is not a file");
  return { url: pathToFileURL(target).href, filePath: target };
}

// Removal stops the worktree's terminals and deletes its folder, which outlasts the default CLI timeout.
const REMOVE_TIMEOUT_MS = 60_000;

const HEADLESS_ERROR = "헤드리스 모드에는 Orca 창이 없어요. 사이드바에서 앱 모드로 바꿔 주세요.";

async function requireAppWindow() {
  if ((await services().orca.runtime.read()).mode === "headless") throw new Error(HEADLESS_ERROR);
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
        await services().orca.cli.run(["tab", "create", "--url", url, "--worktree", `path:${body.worktreePath}`]);
        await services().orca.runtime.bringForward();
      }
    } else if (body.type === "focus-terminal") {
      await requireAppWindow();
      await services().orca.cli.run(["terminal", "switch", "--terminal", body.terminalHandle]);
      await services().orca.runtime.bringForward();
    } else if (body.type === "close-terminal") {
      await services().orca.cli.run(["terminal", "close", "--terminal", body.terminalHandle]);
    } else if (body.type === "close-terminals") {
      const results = await Promise.allSettled(
        body.terminalHandles.map((handle) => services().orca.cli.run(["terminal", "close", "--terminal", handle])),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed > 0) throw new Error(`세션 ${body.terminalHandles.length}개 중 ${failed}개를 닫지 못했어요`);
    } else if (body.type === "send-prompt") {
      await services().orca.cli.run([
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
      await services().orca.cli.run(["terminal", "send", "--terminal", body.terminalHandle, "--text", String(body.option)]);
    } else if (body.type === "answer-permission") {
      if (!services().permissions.answer(body.requestId, body.answer)) throw new Error("이미 끝난 요청이에요");
    } else if (body.type === "launch-agent") {
      const prompt = body.prompt.trim();
      await services().orca.cli.run([
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
      await services().orca.cli.run(["terminal", "create", "--worktree", `path:${body.worktreePath}`, "--focus"]);
      await services().orca.runtime.bringForward();
    } else if (body.type === "remove-worktree") {
      await services().orca.cli.run(
        ["worktree", "rm", "--worktree", `path:${body.worktreePath}`, ...(body.force ? ["--force"] : [])],
        REMOVE_TIMEOUT_MS,
      );
    } else if (body.type === "rename-worktree") {
      await services().orca.cli.run([
        "worktree",
        "set",
        "--worktree",
        `path:${body.worktreePath}`,
        "--display-name",
        body.name.trim(),
      ]);
    } else if (body.type === "import-project") {
      await services().orca.importProject(body.path);
    } else if (body.type === "rename-session") {
      await services().sessionTitles.rename(body.sessionId, body.title.trim());
    } else if (body.type === "bookmark-session") {
      await services().bookmarks.save({ sessionId: body.sessionId, name: body.name.trim(), cwd: body.cwd, memo: body.memo.trim() });
    } else if (body.type === "unbookmark-session") {
      await services().bookmarks.remove(body.sessionId);
    } else {
      const info = await stat(body.cwd);
      if (!info.isDirectory()) throw new Error("session folder no longer exists");
      await services().orca.cli.run([
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
      await services().orca.runtime.bringForward();
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
