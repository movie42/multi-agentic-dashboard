"use client";

import { useQuery } from "@tanstack/react-query";
import { sessionListQueryOptions } from "@/client/entities/session";
import { formatElapsed } from "@/client/shared/lib/format";
import { StatusLine } from "@/client/shared/ui/StatusLine";

const SHOWN = 20;

interface ResumePickerProps {
  cwd: string;
  currentSessionId: string | null;
  onPick: (sessionId: string) => void;
  onClose: () => void;
}

export function ResumePicker({ cwd, currentSessionId, onPick, onClose }: ResumePickerProps) {
  const list = useQuery({ ...sessionListQueryOptions(), refetchOnMount: "always" });
  const sessions = (list.data?.sessions ?? [])
    .filter((session) => session.cwd === cwd && session.sessionId !== currentSessionId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SHOWN);
  const now = list.data?.scannedAt ?? 0;

  return (
    <div
      role="dialog"
      aria-label="이어서 할 대화 고르기"
      onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="flex flex-col gap-1 rounded-[10px] bg-bg p-2 shadow-[inset_0_0_0_1px_var(--hair)]"
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[13px] font-semibold">이어서 할 대화</p>
        <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-fg">
          닫기 (Esc)
        </button>
      </div>
      {list.error ? (
        <StatusLine error={list.error} label="대화 목록을 읽지 못했어요" />
      ) : !list.data ? (
        <p className="px-1 text-[12px] text-muted">불러오는 중…</p>
      ) : sessions.length === 0 ? (
        <p className="px-1 text-[12px] text-muted">이 폴더에서 나눈 다른 대화가 없어요</p>
      ) : (
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {sessions.map((session, index) => (
            <li key={session.sessionId}>
              <button
                type="button"
                autoFocus={index === 0}
                onClick={() => onPick(session.sessionId)}
                className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-tint-2 focus-visible:bg-tint-2 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{session.title}</span>
                  {session.lastPrompt && <span className="ml-2 text-muted">{session.lastPrompt}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-faint tabular-nums">{formatElapsed(session.updatedAt, now)} 전</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
