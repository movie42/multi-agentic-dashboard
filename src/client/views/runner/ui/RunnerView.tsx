"use client";

import { useState } from "react";
import type { RunnerSession, RunnerStatus } from "@/common/runner/types";
import { closeSession, launchSession, RunnerTerminal, useRunnerSessions } from "@/client/entities/runner";
import { toastError } from "@/client/shared/model/toastStore";
import { PendingButton } from "@/client/shared/ui/PendingButton";

const STATUS_LABEL: Record<RunnerStatus, string> = {
  idle: "입력 기다림",
  working: "작업 중",
  waiting: "응답 필요",
  exited: "종료",
};

const STATUS_DOT: Record<RunnerStatus, string> = {
  idle: "bg-done",
  working: "bg-now",
  waiting: "bg-ask",
  exited: "bg-faint",
};

function folderName(cwd: string): string {
  return cwd.split("/").filter(Boolean).at(-1) ?? cwd;
}

interface SessionRowProps {
  session: RunnerSession;
  selected: boolean;
  onSelect: () => void;
}

function SessionRow({ session, selected, onSelect }: SessionRowProps) {
  const close = () => closeSession(session.id).catch((error: unknown) => toastError("runner", error, { id: session.id }));
  return (
    <li className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 ${selected ? "bg-tint" : "hover:bg-tint"}`}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[session.status]}`} />
          {folderName(session.cwd)}
        </span>
        <span className="w-full truncate text-[12px] text-muted">
          {STATUS_LABEL[session.status]} · {session.cwd}
        </span>
      </button>
      <PendingButton onRun={close} className="shrink-0 rounded-full border border-hair px-2.5 py-0.5 text-[12px] hover:bg-bg">
        닫기
      </PendingButton>
    </li>
  );
}

export function RunnerView() {
  const connection = useRunnerSessions();
  const [cwd, setCwd] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("session"),
  );

  const sessions = connection.state === "online" ? connection.sessions : [];
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;

  const launch = async () => {
    try {
      const session = await launchSession(cwd.trim());
      setSelectedId(session.id);
    } catch (error) {
      toastError("runner", error, { cwd });
    }
  };

  return (
    <div className="grid h-[calc(100vh-4rem)] grid-cols-[320px_minmax(0,1fr)] gap-4">
      <aside className="flex min-h-0 flex-col gap-3">
        <h1 className="text-[18px] font-bold">세션 러너</h1>
        <div className="flex flex-col gap-2 rounded-[10px] bg-tint p-3">
          <label htmlFor="runner-cwd" className="text-[12px] text-muted">
            폴더 경로
          </label>
          <input
            id="runner-cwd"
            value={cwd}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCwd(event.target.value)}
            placeholder="/Users/me/projects/app"
            className="rounded-[8px] bg-bg px-2.5 py-1.5 font-mono text-[12px] text-fg outline-none placeholder:text-muted"
          />
          <PendingButton
            onRun={launch}
            disabled={connection.state !== "online" || cwd.trim() === ""}
            className="rounded-full bg-fg px-3.5 py-1.5 text-[13px] font-semibold text-bg hover:opacity-85 disabled:opacity-30"
          >
            claude 띄우기
          </PendingButton>
        </div>
        {connection.state === "offline" && (
          <p role="status" className="rounded-lg bg-tint px-3 py-2 text-[12px] text-muted">
            세션 러너 데몬에 연결하지 못했어요. 터미널에서 <code>bun run daemon</code>을 실행해 주세요.
          </p>
        )}
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              selected={session.id === selected?.id}
              onSelect={() => setSelectedId(session.id)}
            />
          ))}
        </ul>
      </aside>
      <section className="min-h-0">
        {selected ? (
          <RunnerTerminal key={selected.id} sessionId={selected.id} />
        ) : (
          <p className="text-[14px] text-muted">왼쪽에서 폴더를 넣고 claude를 띄워 주세요.</p>
        )}
      </section>
    </div>
  );
}
