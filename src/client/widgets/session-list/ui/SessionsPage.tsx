"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { SessionBookmark, SessionSummary, TitleSource } from "@/common/sessions/types";
import { sessionListQueryOptions, type SessionList } from "@/client/entities/session";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { formatElapsed } from "@/client/shared/lib/format";
import { parseMessage } from "@/client/shared/lib/message";
import { AttachToTodo } from "@/client/features/attach-to-todo";
import { BookmarkMemo, BookmarkStar, bookmarkTarget } from "@/client/features/bookmark-session";
import { SessionTitle } from "@/client/features/rename-session";

type TitleFilter = "all" | "not-custom" | "none";

const TITLE_FILTERS: { key: TitleFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "not-custom", label: "직접 제목 없음" },
  { key: "none", label: "제목 없음" },
];

const TITLE_BADGE: Record<TitleSource, { label: string; className: string }> = {
  custom: { label: "직접 제목", className: "bg-done text-st-ink" },
  ai: { label: "자동 제목", className: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]" },
  none: { label: "제목 없음", className: "bg-ask text-st-ink" },
};

const PAGE_SIZE = 100;

interface SessionsPageProps {
  onAction: (action: ActionRequest) => void;
}

function matchesTitle(session: SessionSummary, filter: TitleFilter): boolean {
  if (filter === "none") return session.titleSource === "none";
  if (filter === "not-custom") return session.titleSource !== "custom";
  return true;
}

export function SessionsPage({ onAction }: SessionsPageProps) {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery(sessionListQueryOptions());
  const [query, setQuery] = useState("");
  const [titleFilter, setTitleFilter] = useState<TitleFilter>("all");
  const [project, setProject] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAutomated, setShowAutomated] = useState(false);
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const updateSessions = (update: (list: SessionSummary[]) => SessionSummary[]) =>
    queryClient.setQueryData<SessionList>(sessionListQueryOptions().queryKey, (previous) =>
      previous ? { ...previous, sessions: update(previous.sessions) } : previous,
    );

  const renameLocally = (sessionId: string, title: string) =>
    updateSessions((list) =>
      list.map((entry) => (entry.sessionId === sessionId ? { ...entry, title, titleSource: "custom" as const } : entry)),
    );

  const setBookmarkLocally = (sessionId: string, bookmark: SessionBookmark | null) =>
    updateSessions((list) => list.map((entry) => (entry.sessionId === sessionId ? { ...entry, bookmark } : entry)));

  const reload = () => void sessionsQuery.refetch();

  const copyCommand = async (session: SessionSummary) => {
    const command = `${session.cwd ? `cd ${JSON.stringify(session.cwd)} && ` : ""}claude --resume ${session.sessionId}`;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(session.sessionId);
    } catch (error) {
      console.error("[sessions] clipboard", error);
    }
  };

  const loadedSessions = sessionsQuery.data?.sessions ?? null;
  const scannedAt = sessionsQuery.data?.scannedAt ?? 0;
  const allSessions = loadedSessions ?? [];
  const automatedCount = allSessions.filter((session) => session.origin !== "human").length;
  const sessions = showAutomated ? allSessions : allSessions.filter((session) => session.origin === "human");
  const needle = query.trim().toLowerCase();
  const projects = [...new Set(sessions.map((session) => session.project).filter((name): name is string => Boolean(name)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const filtered = sessions.filter(
    (session) =>
      matchesTitle(session, titleFilter) &&
      (!bookmarkedOnly || session.bookmark !== null) &&
      (!project || session.project === project) &&
      (!needle ||
        [session.title, session.firstPrompt, session.lastPrompt, session.lastMessage, session.gitBranch, session.cwd, session.sessionId, session.bookmark?.memo].some(
          (value) => value?.toLowerCase().includes(needle),
        )),
  );
  const counts = {
    custom: sessions.filter((session) => session.titleSource === "custom").length,
    ai: sessions.filter((session) => session.titleSource === "ai").length,
    none: sessions.filter((session) => session.titleSource === "none").length,
  };
  const bookmarkedCount = sessions.filter((session) => session.bookmark !== null).length;

  return (
    <>
      <header>
        <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">지난 세션</h1>
        <p className="mt-2.5 text-[13px] text-muted">
          Claude Code 세션 {sessions.length} · 직접 제목 {counts.custom} · 자동 제목 {counts.ai} · 제목 없음 {counts.none}
          {" · "}
          <button type="button" onClick={reload} className="underline decoration-faint underline-offset-[3px] hover:text-fg">
            {sessionsQuery.isFetching ? "읽는 중…" : "다시 읽기"}
          </button>
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-tint p-0.5 text-[13px] font-semibold">
            {TITLE_FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={titleFilter === option.key}
                onClick={() => setTitleFilter(option.key)}
                className={`rounded-full px-3.5 py-1.5 leading-none ${
                  titleFilter === option.key ? "bg-fg text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            value={project}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setProject(event.target.value)}
            className="rounded-full bg-tint px-3 py-1.5 text-[13px] outline-none"
          >
            <option value="">모든 프로젝트</option>
            {projects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder="검색 · 제목, 요청, 답변, 브랜치, 폴더, 세션 ID"
            className="w-full max-w-md rounded-full bg-tint px-4 py-1.5 text-[14px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
          />
          <button
            type="button"
            aria-pressed={bookmarkedOnly}
            onClick={() => setBookmarkedOnly((current) => !current)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] leading-none font-semibold ${
              bookmarkedOnly ? "bg-fg text-bg" : "bg-tint text-muted hover:text-fg"
            }`}
          >
            ★ 북마크 {bookmarkedCount}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={showAutomated}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setShowAutomated(event.target.checked)}
            />
            자동 실행 세션도 보기 ({automatedCount})
          </label>
          <span className="text-[12px] text-muted">{filtered.length}개</span>
        </div>
      </header>

      {sessionsQuery.error && <p className="text-[14px] text-accent">세션을 읽지 못했어요: {errorMessage(sessionsQuery.error)}</p>}
      {loadedSessions === null && sessionsQuery.isFetching && (
        <p className="text-[14px] text-muted">세션 기록을 읽는 중이에요. 처음 한 번은 몇 초 걸려요.</p>
      )}

      {loadedSessions !== null && (
      <ul className="border-t-2 border-fg">
        {filtered.slice(0, limit).map((session) => {
          const badge = TITLE_BADGE[session.titleSource];
          const reply = parseMessage(session.lastMessage)?.lead;
          const target = bookmarkTarget(session.sessionId, session.title, session.cwd, session.bookmark);
          const onBookmarkChanged = (bookmark: SessionBookmark | null) => setBookmarkLocally(session.sessionId, bookmark);
          return (
            <li
              key={session.sessionId}
              className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-hair py-5 lg:grid-cols-[176px_minmax(0,1fr)]"
            >
              <div className="text-[12px] leading-relaxed text-muted">
                <p className="text-[13px] font-semibold text-fg">{session.project ?? "폴더 모름"}</p>
                {session.gitBranch && <p className="truncate font-mono text-now">⎇ {session.gitBranch}</p>}
                <p>{formatElapsed(session.updatedAt, scannedAt)} 전 마지막 활동</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <p className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] leading-none font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <SessionTitle
                    sessionId={session.sessionId}
                    title={session.titleSource === "none" ? null : session.title}
                    titleSource={session.titleSource}
                    fallback={session.title}
                    textClassName="text-[16px] font-bold tracking-[-0.01em]"
                    onRenamed={(title) => renameLocally(session.sessionId, title)}
                  />
                  {session.origin !== "human" && (
                    <span className="shrink-0 text-[11px] text-muted">
                      {session.origin === "headless" ? "자동 호출" : "다른 세션이 시작"}
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <AttachToTodo
                      target={{
                        sessionId: session.sessionId,
                        title: session.title,
                        repo: session.project,
                        worktreePath: session.cwd && session.cwdExists ? session.cwd : null,
                      }}
                    />
                    <BookmarkStar target={target} onChanged={onBookmarkChanged} />
                  </span>
                </p>
                <BookmarkMemo target={target} onChanged={onBookmarkChanged} />
                {session.lastPrompt && (
                  <p className="line-clamp-2 text-[14px] leading-relaxed text-muted">“{session.lastPrompt}”</p>
                )}
                {reply && <p className="line-clamp-2 text-[14px] leading-relaxed">{reply}</p>}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[13px]">
                  {session.cwd && session.cwdExists ? (
                    <button
                      type="button"
                      onClick={() =>
                        onAction({
                          type: "resume-session",
                          sessionId: session.sessionId,
                          cwd: session.cwd ?? "",
                          title: session.title,
                        })
                      }
                      className="rounded-full bg-fg px-3.5 py-1.5 leading-none font-semibold text-bg hover:opacity-85"
                    >
                      Orca에서 다시 열기 →
                    </button>
                  ) : (
                    <span className="text-muted" title={session.cwd ?? undefined}>
                      폴더 없음 · 지워진 worktree
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => copyCommand(session)}
                    className="text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
                  >
                    {copied === session.sessionId ? "복사했어요" : "resume 명령 복사"}
                  </button>
                  <span className="font-mono text-[11px] text-faint">{session.sessionId}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      )}

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className="self-start rounded-full bg-tint px-4 py-2 text-[13px] font-semibold hover:bg-tint-2"
        >
          {PAGE_SIZE}개 더 보기 ({filtered.length - limit}개 남음)
        </button>
      )}
    </>
  );
}
