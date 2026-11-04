import { mkdir, mkdtemp, readFile, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const ROOT = await mkdtemp(path.join(tmpdir(), "sessions-"));
const PROJECTS = path.join(ROOT, "projects");
const CWD = path.join(ROOT, "work", "repo");
const PROJECT_DIR = path.join(PROJECTS, CWD.replace(/[^A-Za-z0-9]/g, "-"));
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";

process.env.CLAUDE_PROJECTS_DIR = PROJECTS;
process.env.CLAUDE_SESSIONS_DIR = path.join(ROOT, "live");
process.env.AGENT_CONTROL_CACHE_DIR = path.join(ROOT, "cache");
process.env.AGENT_CONTROL_ASK_FILE = path.join(ROOT, "ask-threads.json");
process.env.SB_FILE = path.join(ROOT, "bookmarks.jsonl");

const line = (value: unknown) => JSON.stringify(value);

beforeAll(async () => {
  await mkdir(PROJECT_DIR, { recursive: true });
  await mkdir(CWD, { recursive: true });
  await writeFile(
    path.join(PROJECT_DIR, `${S1}.jsonl`),
    [
      line({ type: "user", cwd: CWD, gitBranch: "feat/a", timestamp: "2026-11-04T01:00:00.000Z", message: { role: "user", content: "<command-name>/clear</command-name>" } }),
      line({ type: "user", cwd: CWD, gitBranch: "feat/a", timestamp: "2026-11-04T01:00:01.000Z", message: { role: "user", content: "첫 요청입니다" } }),
      line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "첫 답변" }] } }),
      line({ type: "ai-title", aiTitle: "AI 제목" }),
      line({ type: "user", gitBranch: "feat/b", message: { role: "user", content: [{ type: "text", text: "두 번째 요청" }] } }),
      line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "마지막 답변은 열 글자를 넘겨요" }] } }),
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(PROJECT_DIR, `${S2}.jsonl`),
    [
      line({ type: "user", cwd: "/does/not/exist", entrypoint: "sdk-cli", message: { role: "user", content: "headless 요청" } }),
      line({ type: "custom-title", customTitle: "직접 붙인 제목" }),
    ].join("\n"),
  );
  await writeFile(path.join(PROJECT_DIR, `${S3}.jsonl`), line({ type: "summary", summary: "no prompts" }));
  await utimes(path.join(PROJECT_DIR, `${S1}.jsonl`), new Date(2_000_000_000), new Date(2_000_000_000));
  await utimes(path.join(PROJECT_DIR, `${S2}.jsonl`), new Date(1_000_000_000), new Date(1_000_000_000));
});

describe("listClaudeSessions", () => {
  it("summarizes transcripts newest first and skips sessions without prompts", async () => {
    const { listClaudeSessions } = await import("@/lib/sessions/claudeSessions");
    const sessions = await listClaudeSessions();
    expect(sessions.map(({ sizeBytes, ...rest }) => ({ ...rest, sized: sizeBytes > 0 }))).toEqual([
      {
        sessionId: S1,
        title: "AI 제목",
        titleSource: "ai",
        cwd: CWD,
        project: "repo",
        cwdExists: true,
        gitBranch: "feat/b",
        firstPrompt: "첫 요청입니다",
        lastPrompt: "두 번째 요청",
        lastMessage: "마지막 답변은 열 글자를 넘겨요",
        startedAt: Date.parse("2026-11-04T01:00:00.000Z"),
        updatedAt: 2_000_000_000,
        origin: "human",
        sized: true,
      },
      {
        sessionId: S2,
        title: "직접 붙인 제목",
        titleSource: "custom",
        cwd: "/does/not/exist",
        project: "exist",
        cwdExists: false,
        gitBranch: null,
        firstPrompt: "headless 요청",
        lastPrompt: "headless 요청",
        lastMessage: null,
        startedAt: null,
        updatedAt: 1_000_000_000,
        origin: "headless",
        sized: true,
      },
    ]);
    const cache = JSON.parse(await readFile(path.join(ROOT, "cache", "claude-sessions.json"), "utf8"));
    expect(cache.version).toBe(3);
    expect(cache.entries).toHaveLength(3);
  });
});

describe("session titles", () => {
  it("reads the title, renames by appending a custom-title line, and reads it back", async () => {
    const { renameSession, sessionRefOf, transcriptOf } = await import("@/lib/sessions/sessionTitle");
    const file = await transcriptOf(S1);
    expect(file).toBe(path.join(PROJECT_DIR, `${S1}.jsonl`));
    const before = await readFile(file, "utf8");
    expect(await sessionRefOf(file, Buffer.byteLength(before))).toEqual({ id: S1, title: "AI 제목", titleSource: "ai", bookmark: null });
    await renameSession(S1, "새 제목");
    const after = await readFile(file, "utf8");
    expect(after.slice(before.length)).toBe(`${line({ type: "custom-title", customTitle: "새 제목", sessionId: S1 })}\n`);
    expect(await sessionRefOf(file, Buffer.byteLength(after))).toMatchObject({ title: "새 제목", titleSource: "custom" });
    await expect(transcriptOf("44444444-4444-4444-8444-444444444444")).rejects.toThrow("세션 기록 파일을 찾지 못했어요");
  });
});

describe("findSession", () => {
  it("matches a pane by its last reply, then remembers the file", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { findSession, projectDirOf } = await import("@/lib/sessions/fullMessage");
    expect(projectDirOf(CWD)).toBe(PROJECT_DIR);
    const byReply = await findSession("pane-1", CWD, "마지막 답변은 열 글자를 넘겨요", null);
    expect(byReply).toMatchObject({ file: path.join(PROJECT_DIR, `${S1}.jsonl`), lastAssistant: "마지막 답변은 열 글자를 넘겨요" });
    expect(await findSession("pane-2", CWD, null, "headless 요청 그리고 더")).toBeNull();
    expect(await findSession("pane-1", CWD, null, null)).toMatchObject({ file: path.join(PROJECT_DIR, `${S1}.jsonl`) });
  });
});

describe("bookmarks", () => {
  it("saves, reads and removes claude bookmarks in the sb file format", async () => {
    const { readBookmarks, removeBookmark, saveBookmark } = await import("@/lib/sessions/bookmarks");
    await writeFile(path.join(ROOT, "bookmarks.jsonl"), `${line({ provider: "codex", name: "x", session_id: "c", cwd: "/", created_at: "2026-01-01 00:00" })}\nnot json\n`);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await saveBookmark({ sessionId: S1, name: "북마크", cwd: CWD, memo: "메모" });
    const saved = await readBookmarks();
    expect([...saved.keys()]).toEqual([S1]);
    expect(saved.get(S1)).toMatchObject({ name: "북마크", memo: "메모", lastOpenedAt: null });
    const raw = (await readFile(path.join(ROOT, "bookmarks.jsonl"), "utf8")).trim().split("\n");
    expect(raw).toHaveLength(2);
    await removeBookmark(S1);
    expect((await readBookmarks()).size).toBe(0);
  });
});
