"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AgentCard } from "@/common/board/types";
import type { ActionRequest } from "@/common/actions/schema";
import { boardKeys, boardQueryOptions } from "@/client/entities/board";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

interface WatchTerminalProps {
  /** The shell card whose terminal output a Claude session gets to read. */
  agent: AgentCard;
}

interface Candidate {
  agent: AgentCard;
  handle: string;
  title: string;
  rank: number;
}

function titleOf(agent: AgentCard): string {
  return (agent.session?.title ?? agent.title ?? agent.prompt ?? "제목 없음").replace(/\s+/g, " ");
}

/** Claude sessions that can read this terminal, the same worktree first, then the same project. */
function candidatesFor(shell: AgentCard, agents: AgentCard[]): Candidate[] {
  return agents
    .flatMap((agent): Candidate[] => {
      const handle = agent.terminalHandle;
      if (!handle || agent.agentType !== "claude" || agent.id === shell.id) return [];
      const rank = agent.worktreePath === shell.worktreePath ? 0 : agent.repo === shell.repo ? 1 : 2;
      return [{ agent, handle, title: titleOf(agent), rank }];
    })
    .sort((a, b) => a.rank - b.rank || (b.agent.updatedAt ?? 0) - (a.agent.updatedAt ?? 0));
}

export function WatchTerminal({ agent }: WatchTerminalProps) {
  const queryClient = useQueryClient();
  const { data: board } = useQuery({ ...boardQueryOptions(), refetchInterval: false });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const shellHandle = agent.terminalHandle;
  if (!shellHandle) return null;

  const candidates = candidatesFor(agent, board?.agents ?? []);
  const watchLinks = (agent.orchestration?.links ?? []).filter((link) => link.kind === "watch");
  const linked = watchLinks.flatMap((link) => {
    const target = candidates.find((candidate) => candidate.handle === link.to);
    return [{ linkId: link.id, handle: link.to, title: target?.title ?? "세션" }];
  });
  const free = candidates.filter((candidate) => !linked.some((item) => item.handle === candidate.handle));

  const run = async (action: ActionRequest) => {
    setPending(true);
    try {
      await postAction(action);
      await queryClient.invalidateQueries({ queryKey: boardKeys.all });
    } catch (error) {
      toastError("watch-terminal", error);
    } finally {
      setPending(false);
    }
  };

  const first = linked[0];
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        title={first ? `이 터미널을 읽는 세션: ${linked.map((item) => item.title).join(", ")}` : "Claude 세션이 이 터미널 출력을 직접 읽게 연결해요"}
        onClick={() => setOpen((current) => !current)}
        className={`max-w-48 truncate rounded-full px-2 py-1 text-[11px] leading-none font-semibold ${
          first ? "bg-tint-2 text-fg" : "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
        }`}
      >
        {first ? `연결됨 · ${first.title}${linked.length > 1 ? ` 외 ${linked.length - 1}` : ""}` : "세션에 연결"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="세션에 연결"
            className="absolute top-full right-0 z-50 mt-1 flex w-80 flex-col gap-2 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
          >
            <p className="text-[12px] text-muted">
              연결한 세션은 이 터미널의 최근 출력을 필요할 때 직접 읽어요. 에러를 복사해 붙일 필요 없이 &ldquo;터미널 에러 봐줘&rdquo;라고 하면 돼요.
            </p>
            {linked.length > 0 && (
              <ul className="flex flex-col">
                {linked.map((item) => (
                  <li key={item.linkId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void run({ type: "unlink-sessions", linkId: item.linkId })}
                      className="shrink-0 text-[12px] font-semibold text-accent disabled:opacity-40"
                    >
                      끊기
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ul className="flex max-h-56 flex-col overflow-y-auto">
              {free.slice(0, 30).map((candidate) => (
                <li key={candidate.handle}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void run({ type: "connect-sessions", from: shellHandle, to: candidate.handle, kind: "watch", prompt: null })}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left hover:bg-tint disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                    {candidate.rank > 0 && (
                      <span className="shrink-0 text-[11px] text-muted">{candidate.rank === 1 ? candidate.agent.worktreeName : candidate.agent.repo}</span>
                    )}
                  </button>
                </li>
              ))}
              {free.length === 0 && <li className="px-2 py-1.5 text-muted">{board ? "연결할 Claude 세션이 없어요" : "세션을 읽는 중…"}</li>}
            </ul>
          </div>
        </>
      )}
    </span>
  );
}
