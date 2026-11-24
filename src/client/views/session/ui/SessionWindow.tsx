"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import { boardQueryOptions } from "@/client/entities/board";
import { useRestOverrides } from "@/client/entities/agent";
import { docWindowUrl, fileWindowUrl, isViewableDoc } from "@/client/features/view-doc";
import { postAction } from "@/client/shared/api/actions";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { toastError } from "@/client/shared/model/toastStore";
import { openWindow } from "@/client/shared/lib/openWindow";
import { CanvasColorSync } from "@/client/features/customize-canvas-color";
import { PromptColorSync } from "@/client/features/customize-prompt-color";
import { AgentCardView } from "@/client/widgets/agent-card";

const DOC_WINDOW = { width: 1200, height: 960 };

interface SessionWindowProps {
  agentId: string | null;
}

interface NoticeProps {
  children: React.ReactNode;
}

function Notice({ children }: NoticeProps) {
  return <p className="px-5 py-10 text-center text-[14px] text-muted">{children}</p>;
}

/** One session filling its own window: chat, terminal and history, answered in place. */
export function SessionWindow({ agentId }: SessionWindowProps) {
  return (
    <>
      <PromptColorSync />
      <CanvasColorSync />
      <SessionWindowBody agentId={agentId} />
    </>
  );
}

function SessionWindowBody({ agentId }: SessionWindowProps) {
  const boardQuery = useQuery(boardQueryOptions());
  const rest = useRestOverrides();
  const board = boardQuery.data;
  const agent = agentId ? board?.agents.find((candidate) => candidate.id === agentId) : undefined;
  const title = agent
    ? `${agent.session?.title?.trim() || agent.title?.trim() || agent.prompt?.replace(/\s+/g, " ").trim().slice(0, 60) || "세션"} · ${agent.worktreeName}`
    : null;
  useEffect(() => {
    if (title) document.title = `${title} · Agent Control`;
  }, [title]);

  // There is no side panel here, so a document opens in its own window instead.
  const runAction = async (action: ActionRequest) => {
    if (action.type === "open-artifact" && action.target.startsWith("/")) {
      openWindow(isViewableDoc(action.target) ? docWindowUrl(action.target) : fileWindowUrl(action.target), DOC_WINDOW);
      return;
    }
    try {
      await postAction(action);
    } catch (actionError) {
      toastError("action", actionError, { type: action.type });
    }
  };

  if (!agentId) return <Notice>열 세션이 정해지지 않았어요.</Notice>;
  if (!board) return <Notice>{boardQuery.error ? `보드를 불러오지 못했어요: ${errorMessage(boardQuery.error)}` : "세션을 불러오는 중…"}</Notice>;
  if (!agent) return <Notice>이 세션은 끝났거나 보드에서 사라졌어요. 창을 닫아도 돼요.</Notice>;

  return (
    <main data-scroll className="h-dvh overflow-y-auto">
      <div className="flex min-h-full flex-col">
        <AgentCardView
          agent={agent}
          now={board.fetchedAt}
          progress={null}
          worktreePr={board.worktrees.find((worktree) => worktree.worktreeId === agent.worktreeId)?.pullRequest ?? null}
          rest={rest.restOf(agent)}
          chatLayout="page"
          surface="flush"
          onRest={(kind) => rest.setRest([agent], kind)}
          onAction={runAction}
        />
      </div>
    </main>
  );
}
