"use client";

import { useQuery } from "@tanstack/react-query";
import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import type { AskThread } from "@/common/intentDiff/types";
import type { AgentCard } from "@/common/orca/types";
import { boardQueryOptions } from "@/client/entities/board";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { Spinner } from "@/client/shared/ui/Spinner";
import { FIX_PROMPT_LEAD, fixPrompt, sendableThreads, type SendableThread } from "../model/fixPrompt";

interface FixFromConclusionsProps {
  worktreePath: string;
  threads: AskThread[];
  markSent: (threadIds: string[]) => Promise<void>;
  onReload: () => void;
}

/** Sends the confirmed conclusions to a new Claude session in the same worktree. */
export function FixFromConclusions({ worktreePath, threads, markSent, onReload }: FixFromConclusionsProps) {
  const sendable = sendableThreads(threads);
  const [open, setOpen] = useState(false);
  const hasSent = threads.some((thread) => thread.conclusion?.sentAt != null);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={sendable.length === 0}
        className="rounded-md bg-fg px-3 py-1 font-semibold text-bg disabled:opacity-40"
      >
        수정하기
      </button>
      {hasSent && <FixProgress worktreePath={worktreePath} onReload={onReload} />}
      {open && sendable.length > 0 && <FixDialog worktreePath={worktreePath} sendable={sendable} markSent={markSent} onClose={() => setOpen(false)} />}
    </span>
  );
}

function latestFixSession(agents: AgentCard[], worktreePath: string): AgentCard | null {
  return agents
    .filter((agent) => agent.worktreePath === worktreePath && agent.prompt?.startsWith(FIX_PROMPT_LEAD))
    .reduce<AgentCard | null>((latest, agent) => (!latest || (agent.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? agent : latest), null);
}

interface FixProgressProps {
  worktreePath: string;
  onReload: () => void;
}

/** Where the last fix session stands, so the page says what happened after the button went quiet. */
function FixProgress({ worktreePath, onReload }: FixProgressProps) {
  const { data: board } = useQuery(boardQueryOptions());
  const session = board ? latestFixSession(board.agents, worktreePath) : null;
  const sessionId = session?.id ?? null;
  const state = session?.state ?? null;

  // Reload only on a working → finished change seen on this page, not for a session already finished on arrival.
  const reload = useEffectEvent(onReload);
  const previous = useRef<{ id: string | null; state: string | null }>({ id: null, state: null });
  useEffect(() => {
    const last = previous.current;
    previous.current = { id: sessionId, state };
    if (last.id === sessionId && last.state === "working" && (state === "done" || state === "idle")) reload();
  }, [sessionId, state]);

  if (!session) return null;
  if (session.state === "working") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-muted">
        <Spinner className="text-accent" />
        수정 중{session.toolName && ` · ${session.toolName}`}
      </span>
    );
  }
  if (session.state === "blocked" || session.state === "waiting") {
    return (
      <span role="status" className="text-ask">
        수정 세션이 답을 기다려요
      </span>
    );
  }
  return (
    <span role="status" className="text-done">
      수정 끝
    </span>
  );
}

interface FixDialogProps {
  worktreePath: string;
  sendable: SendableThread[];
  markSent: (threadIds: string[]) => Promise<void>;
  onClose: () => void;
}

function FixDialog({ worktreePath, sendable, markSent, onClose }: FixDialogProps) {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const chosen = sendable.filter((thread) => !excluded.has(thread.id));
  const prompt = fixPrompt(chosen);
  const { data: board } = useQuery({ ...boardQueryOptions(), refetchInterval: false });
  const busy = board?.agents.some((agent) => agent.worktreePath === worktreePath && agent.state === "working") ?? false;

  const [, dispatch, pending] = useActionState(async (_previous: null, ids: string[]): Promise<null> => {
    try {
      await postAction({ type: "launch-agent", worktreePath, prompt });
      await markSent(ids);
      onClose();
    } catch (error) {
      toastError("fix-from-conclusions", error);
    }
    return null;
  }, null);

  const onEscape = useEffectEvent(onClose);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggle = (id: string) =>
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-fg/20 px-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={`결론 ${chosen.length}개로 수정하기`}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-[14px] bg-bg p-5 font-sans shadow-[0_24px_64px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
        onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <h2 className="text-[18px] font-bold">결론 {chosen.length}개로 수정하기</h2>
        {busy && <p className="text-[13px] text-accent">이 워크트리에서 일하는 세션이 있어요. 같은 파일을 고칠 수 있어요.</p>}
        <ul className="flex flex-col gap-2 overflow-y-auto text-[13px]">
          {sendable.map((thread) => (
            <li key={thread.id}>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-1" checked={!excluded.has(thread.id)} onChange={() => toggle(thread.id)} />
                <span className="flex flex-col">
                  <span className="font-mono text-[12px] text-muted">
                    {thread.anchor.file}:{thread.anchor.startLine}
                    {thread.anchor.endLine !== thread.anchor.startLine && `–${thread.anchor.endLine}`}
                  </span>
                  <span className="whitespace-pre-wrap">{thread.conclusion.text}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <pre className="max-h-48 overflow-auto rounded-md bg-tint px-3 py-2 font-mono text-[12px] leading-[1.5] whitespace-pre-wrap">{prompt}</pre>
        <div className="flex items-center justify-end gap-3 text-[13px]">
          <button type="button" onClick={onClose} className="text-muted hover:text-fg">
            취소
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => dispatch(chosen.map((thread) => thread.id)))}
            disabled={chosen.length === 0 || pending}
            aria-busy={pending}
            className="rounded-md bg-fg px-3 py-1 font-semibold text-bg disabled:opacity-40"
          >
            보내기
          </button>
        </div>
      </div>
    </div>
  );
}
