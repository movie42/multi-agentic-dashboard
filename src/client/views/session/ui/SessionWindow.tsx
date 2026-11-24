"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/board/types";
import { boardQueryOptions } from "@/client/entities/board";
import {
  acceptsSessionDrag,
  droppedSessionId,
  HEARTBEAT_MS,
  liveSessionWindows,
  onSessionMessage,
  openSessionWindow,
  postSessionMessage,
  readRegistry,
  sessionWindowHref,
  thisWindowId,
  updateRegistry,
  useRestOverrides,
  watchTaken,
  withWindow,
  withoutWindow,
  type SessionWindowMessage,
} from "@/client/entities/agent";
import { docWindowUrl, fileWindowUrl, isViewableDoc } from "@/client/features/view-doc";
import { CanvasColorSync } from "@/client/features/customize-canvas-color";
import { PromptColorSync } from "@/client/features/customize-prompt-color";
import { postAction } from "@/client/shared/api/actions";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { toastError, useToastStore } from "@/client/shared/model/toastStore";
import { openWindow } from "@/client/shared/lib/openWindow";
import { AgentCardView } from "@/client/widgets/agent-card";
import { DETACH_HINT, useDetachDrag } from "@/client/widgets/doc-panel";

const DOC_WINDOW = { width: 1200, height: 960 };
/** How long "메인 창으로" waits for the main window to say it took the session. */
const DOCK_WAIT_MS = 4_000;

const HEADER_BUTTON = "underline decoration-faint underline-offset-[3px] hover:decoration-current disabled:opacity-40";

interface SessionWindowProps {
  /** The sessions the window opens with, one tab each, in order. */
  agentIds: readonly string[];
}

interface NoticeProps {
  children: React.ReactNode;
}

function Notice({ children }: NoticeProps) {
  return <p className="px-5 py-10 text-center text-[14px] text-muted">{children}</p>;
}

function sessionLabel(agent: AgentCard): string {
  return agent.session?.title?.trim() || agent.title?.trim() || agent.prompt?.replace(/\s+/g, " ").trim().slice(0, 60) || "세션";
}

/** Sessions filling their own window as tabs, which move to other windows and back like the right panel's. */
export function SessionWindow({ agentIds }: SessionWindowProps) {
  return (
    <>
      <PromptColorSync />
      <CanvasColorSync />
      <SessionWindowBody agentIds={agentIds} />
    </>
  );
}

function SessionWindowBody({ agentIds }: SessionWindowProps) {
  const boardQuery = useQuery(boardQueryOptions());
  const rest = useRestOverrides();
  const board = boardQuery.data;
  const [tabs, setTabs] = useState<string[]>(() => [...new Set(agentIds)]);
  const [front, setFront] = useState<string | null>(agentIds[0] ?? null);
  const [dropping, setDropping] = useState(false);
  const active = front !== null && tabs.includes(front) ? front : (tabs[0] ?? null);
  const tabsRef = useRef(tabs);
  const agentOf = (id: string) => board?.agents.find((candidate) => candidate.id === id);
  const activeAgent = active ? agentOf(active) : undefined;
  const title = activeAgent ? `${sessionLabel(activeAgent)} · ${activeAgent.worktreeName}` : null;
  const tabsKey = tabs.join("\n");

  const addTabs = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    setTabs((current) => [...current, ...ids.filter((id) => !current.includes(id))]);
    setFront(ids.at(-1) ?? null);
  };
  const removeTab = (id: string) => setTabs((current) => current.filter((other) => other !== id));

  useEffect(() => {
    if (title) document.title = `${title} · Agent Control`;
  }, [title]);

  useEffect(() => {
    tabsRef.current = tabs;
    if (tabs.length === 0) {
      // Every tab left for another window. A window opened with no session says so instead of vanishing.
      if (agentIds.length > 0) window.close();
      return;
    }
    window.history.replaceState(null, "", sessionWindowHref(tabs));
    // Also drops the entry the opener kept under this window's name while it loaded.
    const report = () =>
      updateRegistry((registry) => withWindow(withoutWindow(registry, window.name), thisWindowId(), tabsRef.current, Date.now()));
    const leave = () => updateRegistry((registry) => withoutWindow(registry, thisWindowId()));
    report();
    const heartbeat = setInterval(report, HEARTBEAT_MS);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", leave);
      leave();
    };
    // Keyed on the tab ids; `tabs` itself is a new array after every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsKey]);

  useEffect(() => {
    const me = thisWindowId();
    const onMessage = (message: SessionWindowMessage) => {
      switch (message.type) {
        case "taken":
          if (message.by !== me) setTabs((current) => current.filter((id) => id !== message.agentId));
          return;
        case "focus":
          if (!tabsRef.current.includes(message.agentId)) return;
          setFront(message.agentId);
          window.focus();
          return;
        case "merge-into":
          if (message.target === me || tabsRef.current.length === 0) return;
          postSessionMessage({ type: "hand-over", target: message.target, agentIds: tabsRef.current });
          setTabs([]);
          return;
        case "hand-over":
          if (message.target !== me) return;
          setTabs((current) => [...current, ...message.agentIds.filter((id) => !current.includes(id))]);
          setFront(message.agentIds.at(-1) ?? null);
          return;
        case "dock":
          return;
      }
    };
    return onSessionMessage(onMessage);
  }, []);

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

  const sendToMain = async () => {
    if (!active) return;
    const watch = watchTaken(active);
    postSessionMessage({ type: "dock", agentId: active, from: thisWindowId() });
    if (!(await watch.wait(DOCK_WAIT_MS))) {
      useToastStore.getState().show("메인 창에 보내지 못했어요. 메인 창이 열려 있는지 확인해 주세요.", "error");
    }
  };

  const gatherAll = () => {
    postSessionMessage({ type: "merge-into", target: thisWindowId() });
    if (liveSessionWindows(readRegistry(), Date.now(), thisWindowId()).length === 0) {
      useToastStore.getState().show("합칠 다른 세션 창이 없어요.", "info");
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!acceptsSessionDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropping(true);
  };
  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    setDropping(false);
    if (!acceptsSessionDrag(event.dataTransfer)) return;
    event.preventDefault();
    const id = droppedSessionId(event.dataTransfer);
    if (!id) return;
    addTabs([id]);
    postSessionMessage({ type: "taken", agentId: id, by: thisWindowId() });
  };

  if (agentIds.length === 0) return <Notice>열 세션이 정해지지 않았어요.</Notice>;
  // Shown when the window could not close itself, as a browser tab the person opened would not.
  if (tabs.length === 0) return <Notice>탭을 모두 다른 창으로 옮겼어요. 창을 닫아도 돼요.</Notice>;
  if (!board) return <Notice>{boardQuery.error ? `보드를 불러오지 못했어요: ${errorMessage(boardQuery.error)}` : "세션을 불러오는 중…"}</Notice>;

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-end gap-2 border-b border-hair bg-tint px-3 pt-2">
        <div
          role="tablist"
          aria-label="세션 탭"
          onDragOver={onDragOver}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
          className={`flex min-h-9 min-w-0 flex-1 items-end gap-0.5 overflow-x-auto rounded-t-md ${dropping ? "bg-tint-2" : ""}`}
        >
          {tabs.map((id) => {
            const agent = agentOf(id);
            return (
              <SessionTab
                key={id}
                id={id}
                label={agent ? sessionLabel(agent) : "끝난 세션"}
                active={id === active}
                onActivate={() => setFront(id)}
                onClose={() => removeTab(id)}
              />
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3 pb-2 text-[13px]">
          <button type="button" onClick={() => void sendToMain()} disabled={!active} title="지금 탭을 메인 창 오른쪽 패널로 보내요" className={HEADER_BUTTON}>
            메인 창으로
          </button>
          <button type="button" onClick={gatherAll} title="떠 있는 다른 세션 창의 탭을 전부 이 창으로 모아요" className={HEADER_BUTTON}>
            세션 창 모두 합치기
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {tabs.map((id) => {
          const agent = agentOf(id);
          return (
            <div key={id} data-tab-panel data-scroll className={`absolute inset-0 overflow-y-auto ${id === active ? "" : "invisible"}`}>
              {agent ? (
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
              ) : (
                <Notice>이 세션은 끝났거나 보드에서 사라졌어요. 탭을 닫아도 돼요.</Notice>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

interface SessionTabProps {
  id: string;
  label: string;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}

function SessionTab({ id, label, active, onActivate, onClose }: SessionTabProps) {
  const drag = useDetachDrag(
    id,
    (at) => {
      if (openSessionWindow(id, at)) onClose();
    },
    { sessionId: id, onMoved: onClose },
  );
  return (
    <div
      role="tab"
      aria-selected={active}
      {...drag}
      onClick={onActivate}
      onAuxClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button === 1) onClose();
      }}
      title={`${label}\n다른 창의 탭 줄에 놓으면 그 창으로 옮겨 가요 · ${DETACH_HINT}`}
      className={`group flex max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border-x border-t px-3 py-1.5 text-[13px] select-none ${
        active ? "border-hair bg-bg font-semibold" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`${label} 닫기`}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onClose();
        }}
        className="rounded px-1 leading-none text-muted opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 hover:bg-tint-2 hover:text-fg"
      >
        ×
      </button>
    </div>
  );
}
