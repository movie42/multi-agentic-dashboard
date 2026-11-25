"use client";

import type { AgentCard } from "@/common/board/types";
import { requestDock, StateBadge } from "@/client/entities/agent";
import { plainMessage } from "@/client/shared/lib/format";

function titleOf(agent: AgentCard): string {
  return agent.session?.title ?? agent.title ?? agent.prompt?.split("\n")[0] ?? "제목 없음";
}

interface ConductedSessionsProps {
  workers: AgentCard[];
}

/** The sessions a conductor handed work to; each opens as a panel tab. Nothing when there are none. */
export function ConductedSessions({ workers }: ConductedSessionsProps) {
  if (workers.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-[12px] font-semibold text-muted">지휘하는 세션 {workers.length}</p>
      <ul className="flex flex-col gap-1">
        {workers.map((worker) => (
          <li key={worker.id}>
            <button
              type="button"
              onClick={() => requestDock(worker.id)}
              className="flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-[10px] px-3 py-2 text-left shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2"
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <StateBadge agent={worker} />
                <span className="truncate text-[13px] font-semibold">{titleOf(worker)}</span>
              </span>
              <span className="truncate text-[12px] text-muted">{`${worker.repo} · ${worker.worktreeName}`}</span>
              {worker.lastMessage && <span className="line-clamp-2 text-[12px] text-muted">{plainMessage(worker.lastMessage)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
