import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { actionRequestSchema, type ActionResponse, type VoiceReadResponse, type VoiceToggleResponse } from "@/common/actions/schema";
import { services } from "@/server/container";

const execFileAsync = promisify(execFile);

async function resolveTarget(target: string): Promise<string> {
  if (/^https?:\/\//.test(target)) return target;
  if (!path.isAbsolute(target)) throw new Error("target must be an absolute path or http(s) URL");
  const info = await stat(target);
  if (!info.isFile()) throw new Error("target is not a file");
  return target;
}

export async function POST(request: Request) {
  const parsed = actionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid action" } satisfies ActionResponse, {
      status: 400,
    });
  }
  const body = parsed.data;
  const { runner, worktrees } = services();

  if (body.type === "toggle-voice") {
    try {
      const result = await services().voice.toggle(body.terminalHandle, body.intent);
      return Response.json({ ok: true, ...result } satisfies VoiceToggleResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[actions]", body.type, message);
      return Response.json({ ok: false, error: message } satisfies VoiceToggleResponse, { status: 500 });
    }
  }

  if (body.type === "read-voice") {
    try {
      const voice = await services().voice.read(body.terminalHandle);
      return Response.json({ ok: true, ...voice } satisfies VoiceReadResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[actions]", body.type, message);
      return Response.json({ ok: false, error: message } satisfies VoiceReadResponse, { status: 500 });
    }
  }

  try {
    if (body.type === "open-artifact") {
      await execFileAsync("open", [await resolveTarget(body.target)]);
    } else if (body.type === "close-terminal") {
      await runner.close(body.terminalHandle);
    } else if (body.type === "close-terminals") {
      const results = await Promise.allSettled(body.terminalHandles.map((handle) => runner.close(handle)));
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed > 0) throw new Error(`세션 ${body.terminalHandles.length}개 중 ${failed}개를 닫지 못했어요`);
    } else if (body.type === "answer-permission") {
      await runner.answerPermission(body.terminalHandle, body.requestId, body.answer);
    } else if (body.type === "interrupt-session") {
      await runner.input(body.terminalHandle, { text: "\x1b", raw: true });
    } else if (body.type === "set-model") {
      await runner.input(body.terminalHandle, { text: `/model ${body.model}`, submit: true });
    } else if (body.type === "send-prompt") {
      await runner.input(body.terminalHandle, { text: body.text, submit: true });
    } else if (body.type === "launch-agent") {
      const prompt = body.prompt.trim();
      await runner.launch({ cwd: body.worktreePath, ...(prompt ? { prompt } : {}) });
    } else if (body.type === "open-terminal") {
      await runner.launch({ cwd: body.worktreePath, kind: "shell" });
    } else if (body.type === "remove-worktree") {
      await worktrees.remove(body.worktreePath, body.force);
    } else if (body.type === "rename-worktree") {
      await worktrees.rename(body.worktreePath, body.name);
    } else if (body.type === "import-project") {
      await services().projects.add(body.path);
    } else if (body.type === "rename-session") {
      await services().sessionTitles.rename(body.sessionId, body.title.trim());
    } else if (body.type === "bookmark-session") {
      await services().bookmarks.save({ sessionId: body.sessionId, name: body.name.trim(), cwd: body.cwd, memo: body.memo.trim() });
    } else if (body.type === "unbookmark-session") {
      await services().bookmarks.remove(body.sessionId);
    } else {
      const info = await stat(body.cwd);
      if (!info.isDirectory()) throw new Error("session folder no longer exists");
      await runner.launch({ cwd: body.cwd, resumeSessionId: body.sessionId });
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
