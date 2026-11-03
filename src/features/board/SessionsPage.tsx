"use client";

import { useEffect, useState } from "react";
import type { ActionRequest } from "@/lib/orca/actions";
import type { SessionSummary, SessionsResponse, TitleSource } from "@/lib/sessions/types";
import { formatElapsed } from "./format";
import { parseMessage } from "./message";
import { SessionTitle } from "./SessionTitle";

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

let lastLoaded: { sessions: SessionSummary[]; scannedAt: number } | null = null;

interface SessionsState {
  sessions: SessionSummary[] | null;
  scannedAt: number;
  error: string | null;
  loading: boolean;
}

interface SessionsPageProps {
  onAction: (action: ActionRequest) => void;
}

function matchesTitle(session: SessionSummary, filter: TitleFilter): boolean {
  if (filter === "none") return session.titleSource === "none";
  if (filter === "not-custom") return session.titleSource !== "custom";
  return true;
}

export function SessionsPage({ onAction }: SessionsPageProps) {
  const [state, setState] = useState<SessionsState>({
    sessions: lastLoaded?.sessions ?? null,
    scannedAt: lastLoaded?.scannedAt ?? 0,
    error: null,
    loading: true,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [titleFilter, setTitleFilter] = useState<TitleFilter>("all");
  const [project, setProject] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAutomated, setShowAutomated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions", { cache: "no-store" })
      .then((response) => response.json() as Promise<SessionsResponse>)
      .then((payload) => {
        if (cancelled) return;
        if (payload.ok) lastLoaded = { sessions: payload.sessions, scannedAt: payload.scannedAt };
        setState((previous) =>
          payload.ok
            ? { sessions: payload.sessions, scannedAt: payload.scannedAt, error: null, loading: false }
            : { ...previous, error: payload.error, loading: false },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((previous) => ({ ...previous, error: String(error), loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const renameLocally = (sessionId: string, title: string) => {
    const rename = (list: SessionSummary[]) =>
      list.map((entry) => (entry.sessionId === sessionId ? { ...entry, title, titleSource: "custom" as const } : entry));
    setState((previous) => ({ ...previous, sessions: previous.sessions ? rename(previous.sessions) : null }));
  };

  const reload = () => {
    setState((previous) => ({ ...previous, loading: true }));
    setReloadKey((key) => key + 1);
  };

  const copyCommand = async (session: SessionSummary) => {
    const command = `${session.cwd ? `cd ${JSON.stringify(session.cwd)} && ` : ""}claude --resume ${session.sessionId}`;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(session.sessionId);
    } catch (error) {
      console.error("[sessions] clipboard", error);
    }
  };

  const allSessions = state.sessions ?? [];
  const automatedCount = allSessions.filter((session) => session.origin !== "human").length;
  const sessions = showAutomated ? allSessions : allSessions.filter((session) => session.origin === "human");
  const needle = query.trim().toLowerCase();
  const projects = [...new Set(sessions.map((session) => session.project).filter((name): name is string => Boolean(name)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const filtered = sessions.filter(
    (session) =>
      matchesTitle(session, titleFilter) &&
      (!project || session.project === project) &&
      (!needle ||
        [session.title, session.firstPrompt, session.lastPrompt, session.lastMessage, session.gitBranch, session.cwd, session.sessionId].some(
          (value) => value?.toLowerCase().includes(needle),
        )),
  );
  const counts = {
    custom: sessions.filter((session) => session.titleSource === "custom").length,
    ai: sessions.filter((session) => session.titleSource === "ai").length,
    none: sessions.filter((session) => session.titleSource === "none").length,
  };

  return (
    <>
      <header>
        <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">지난 세션</h1>
        <p className="mt-2.5 text-[13px] text-muted">
          Claude Code 세션 {sessions.length} · 직접 제목 {counts.custom} · 자동 제목 {counts.ai} · 제목 없음 {counts.none}
          {" · "}
          <button type="button" onClick={reload} className="underline decoration-faint underline-offset-[3px] hover:text-fg">
            {state.loading ? "읽는 중…" : "다시 읽기"}
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

      {state.error && <p className="text-[14px] text-accent">세션을 읽지 못했어요: {state.error}</p>}
      {state.sessions === null && state.loading && (
        <p className="text-[14px] text-muted">세션 기록을 읽는 중이에요. 처음 한 번은 몇 초 걸려요.</p>
      )}

      {state.sessions !== null && (
      <ul className="border-t-2 border-fg">
        {filtered.slice(0, limit).map((session) => {
          const badge = TITLE_BADGE[session.titleSource];
          const reply = parseMessage(session.lastMessage)?.lead;
          return (
            <li
              key={session.sessionId}
              className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-hair py-5 lg:grid-cols-12"
            >
              <div className="text-[12px] leading-relaxed text-muted lg:col-span-3">
                <p className="text-[13px] font-semibold text-fg">{session.project ?? "폴더 모름"}</p>
                {session.gitBranch && <p className="truncate font-mono text-now">⎇ {session.gitBranch}</p>}
                <p>{formatElapsed(session.updatedAt, state.scannedAt)} 전 마지막 활동</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2 lg:col-span-9">
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
                </p>
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
