"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/board/types";
import { useTerminalRequest } from "@/client/entities/runner";
import { parseMessage } from "@/client/shared/lib/message";
import { useStoredList } from "@/client/shared/lib/useStoredList";

const SESSION_DRAG_TYPE = "application/x-agent-control-session";

const selectedKey = (worktreeId: string) => `agent-control:session-tab:${worktreeId}`;
const selectedWorkerKey = (worktreeId: string) => `agent-control:session-subtab:${worktreeId}`;

type DropEdge = "before" | "after";

export function tabTitle(agent: AgentCard): string {
  if (agent.session?.title) return agent.session.title;
  if (agent.agentType === "shell") return agent.title ?? "터미널";
  const lead = agent.prompt ?? parseMessage(agent.lastMessage)?.lead ?? null;
  return lead ? lead.replace(/\s+/g, " ").slice(0, 40) : "새 세션";
}

function dotTone(agent: AgentCard, needsMe: boolean): string {
  if (needsMe) return "bg-accent";
  if (agent.state === "working") return "bg-now animate-pulse";
  return "bg-faint";
}

interface SessionTabProps {
  agent: AgentCard;
  selected: boolean;
  needsMe: boolean;
  onSelect: () => void;
  onClose: (() => void) | null;
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  workerCount?: number;
  label?: string;
}

function SessionTab({ agent, selected, needsMe, onSelect, onClose, onReorder, workerCount = 0, label }: SessionTabProps) {
  const terminalRequest = useTerminalRequest(agent.terminalHandle);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const [dragging, setDragging] = useState(false);
  const seenRequest = useRef(terminalRequest);
  useEffect(() => {
    if (terminalRequest === seenRequest.current) return;
    seenRequest.current = terminalRequest;
    onSelect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- select only when a new terminal request arrives
  }, [terminalRequest]);
  const edgeOf = (event: React.DragEvent<HTMLElement>): DropEdge => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
  };
  const title = label ?? tabTitle(agent);

  return (
    <li
      role="presentation"
      onDragOver={(event: React.DragEvent<HTMLLIElement>) => {
        if (!onReorder || !event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!dragging) setDropEdge(edgeOf(event));
      }}
      onDragLeave={() => setDropEdge(null)}
      onDrop={(event: React.DragEvent<HTMLLIElement>) => {
        setDropEdge(null);
        const draggedId = event.dataTransfer.getData(SESSION_DRAG_TYPE);
        if (!onReorder || !draggedId) return;
        event.preventDefault();
        if (draggedId !== agent.id) onReorder(draggedId, agent.id, edgeOf(event) === "after");
      }}
      className={`group/tab relative flex shrink-0 items-center rounded-t-lg ${
        selected ? "bg-tint" : "hover:bg-tint/60"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {dropEdge && (
        <span
          aria-hidden
          className={`absolute top-1 bottom-1 w-0.5 rounded-full bg-focus ${dropEdge === "before" ? "-left-0.5" : "-right-0.5"}`}
        />
      )}
      <button
        type="button"
        role="tab"
        data-session-tab={agent.id}
        aria-selected={selected}
        draggable={Boolean(onReorder)}
        onDragStart={(event: React.DragEvent<HTMLButtonElement>) => {
          event.dataTransfer.setData(SESSION_DRAG_TYPE, agent.id);
          event.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={onSelect}
        title={`${title}${needsMe ? " · 내 차례" : ""}`}
        className={`flex max-w-60 items-center gap-2 py-2 pl-3 text-[13px] leading-none ${onClose ? "pr-1" : "pr-3"} ${
          selected ? "font-semibold text-fg" : "text-muted hover:text-fg"
        }`}
      >
        <span className={`size-2 shrink-0 rounded-full ${dotTone(agent, needsMe)}`} />
        {agent.agentType === "shell" && <span className="shrink-0 font-mono text-[11px] text-faint">$</span>}
        <span className="truncate">{title}</span>
        {workerCount > 0 && (
          <span
            data-worker-count={workerCount}
            title={`하위 세션 ${workerCount}개`}
            className="shrink-0 rounded-full bg-tint-2 px-1.5 py-0.5 text-[11px] leading-none font-medium text-muted"
          >
            +{workerCount}
          </span>
        )}
      </button>
      {onClose && (
        <button
          type="button"
          data-close-session={agent.id}
          aria-label={`${title} 세션 닫기`}
          title="세션을 닫아요. 기록은 지난 세션에 남아요"
          onClick={onClose}
          className={`mr-1.5 flex size-5 shrink-0 items-center justify-center rounded text-[14px] leading-none text-muted hover:bg-tint-2 hover:text-fg ${
            selected ? "" : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100"
          }`}
        >
          ×
        </button>
      )}
    </li>
  );
}

interface SessionTabsProps {
  worktreeId: string;
  agents: AgentCard[];
  needsMeIds: ReadonlySet<string>;
  focusId: string | null;
  renderCard: (agent: AgentCard) => React.ReactNode;
  workersOf?: (agent: AgentCard) => AgentCard[];
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  onNewSession: () => void;
  onAction: (action: ActionRequest) => Promise<void>;
}

export function SessionTabs({
  worktreeId,
  agents,
  needsMeIds,
  focusId,
  renderCard,
  workersOf = () => [],
  onReorder,
  onNewSession,
  onAction,
}: SessionTabsProps) {
  const [stored, write] = useStoredList(selectedKey(worktreeId));
  const [storedWorker, writeWorker] = useStoredList(selectedWorkerKey(worktreeId));
  const storedId = stored[0] ?? null;
  const selected = agents.find((agent) => agent.id === storedId) ?? agents[0] ?? null;
  const workers = selected ? workersOf(selected) : [];
  const selectedWorker = workers.find((worker) => worker.id === storedWorker[0]) ?? null;
  const shown = selectedWorker ?? selected;
  const hasWorkers = selected !== null && workers.length > 0;
  const select = (id: string) => write([id]);
  const selectWorker = (id: string | null) => writeWorker(id ? [id] : []);
  useEffect(() => {
    if (!focusId) return;
    if (agents.some((agent) => agent.id === focusId)) {
      write([focusId]);
      writeWorker([]);
      return;
    }
    const coordinator = agents.find((agent) => workersOf(agent).some((worker) => worker.id === focusId));
    if (coordinator) {
      write([coordinator.id]);
      writeWorker([focusId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow a jump target only when it changes
  }, [focusId]);

  return (
    <div data-session-tabs className={`flex flex-col ${hasWorkers ? "[--tabs-h:4.75rem]" : ""}`}>
      <div className="sticky top-[var(--strip-h,0px)] z-20 flex h-[var(--tabs-h,auto)] flex-col bg-bg">
        <div className="flex min-h-10 flex-1 items-end border-b border-hair">
          <ul role="tablist" aria-label="세션" className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
            {agents.map((agent) => {
              const terminalHandle = agent.terminalHandle;
              return (
                <SessionTab
                  key={agent.id}
                  agent={agent}
                  selected={agent.id === selected?.id}
                  needsMe={needsMeIds.has(agent.id)}
                  onSelect={() => select(agent.id)}
                  onClose={terminalHandle ? () => void onAction({ type: "close-terminal", terminalHandle }) : null}
                  onReorder={onReorder}
                  workerCount={workersOf(agent).length}
                />
              );
            })}
          </ul>
          <button
            type="button"
            data-new-session
            aria-label="새 세션"
            title="이 워크트리에 새 세션을 띄워요"
            onClick={onNewSession}
            className="mb-1 ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-[18px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
          >
            +
          </button>
        </div>
        {selected && hasWorkers && (
          <div data-worker-tabs className="flex h-9 shrink-0 items-end border-b border-hair pl-6">
            <ul role="tablist" aria-label="하위 세션" className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
              <SessionTab
                agent={selected}
                label="지휘자"
                selected={selectedWorker === null}
                needsMe={needsMeIds.has(selected.id)}
                onSelect={() => selectWorker(null)}
                onClose={null}
              />
              {workers.map((worker) => {
                const terminalHandle = worker.terminalHandle;
                return (
                  <SessionTab
                    key={worker.id}
                    agent={worker}
                    selected={worker.id === selectedWorker?.id}
                    needsMe={needsMeIds.has(worker.id)}
                    onSelect={() => selectWorker(worker.id)}
                    onClose={terminalHandle ? () => void onAction({ type: "close-terminal", terminalHandle }) : null}
                  />
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {shown && (
        <div role="tabpanel" className="flex flex-col gap-4 pt-0">
          {renderCard(shown)}
        </div>
      )}
    </div>
  );
}
