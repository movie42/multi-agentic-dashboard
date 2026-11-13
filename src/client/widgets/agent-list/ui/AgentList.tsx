"use client";

import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/orca/types";
import { StateBadge } from "@/client/entities/agent";
import { formatElapsed } from "@/client/shared/lib/format";
import { parseMessage } from "@/client/shared/lib/message";
import { QuickReply } from "@/client/features/quick-reply";
import { BookmarkMark, bookmarkTarget } from "@/client/features/bookmark-session";
import { ContextMenu, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";

interface AgentListProps {
  agents: AgentCard[];
  now: number;
  showRepo: boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
  expandedId?: string | null;
  onJump?: (agent: AgentCard) => void;
  workersOf?: (agent: AgentCard) => AgentCard[];
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  onAction?: (action: ActionRequest) => Promise<void>;
}

const SESSION_DRAG_TYPE = "application/x-agent-control-session";

type DropEdge = "before" | "after";

function DropSlot() {
  return <div aria-hidden className="mx-1 my-1 h-11 rounded-md border border-dashed border-focus bg-tint" />;
}

export function AgentList({
  agents,
  now,
  showRepo,
  renderCard,
  expandedId = null,
  onJump,
  workersOf,
  onReorder,
  onAction,
}: AgentListProps) {
  const listHandles = agents
    .flatMap((agent) => [agent, ...(workersOf?.(agent) ?? [])])
    .flatMap((agent) => (agent.terminalHandle ? [agent.terminalHandle] : []));
  return (
    <ul className="border-t border-hair">
      {agents.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          now={now}
          showRepo={showRepo}
          renderCard={renderCard}
          initiallyExpanded={agent.id === expandedId}
          onJump={onJump}
          workers={workersOf?.(agent) ?? []}
          onReorder={onReorder}
          onAction={onAction}
          listHandles={listHandles}
        />
      ))}
    </ul>
  );
}

interface AgentRowProps {
  agent: AgentCard;
  now: number;
  showRepo: boolean;
  renderCard: (agent: AgentCard) => React.ReactNode;
  initiallyExpanded: boolean;
  onJump?: (agent: AgentCard) => void;
  workers: AgentCard[];
  onReorder?: (draggedId: string, targetId: string, placeAfter: boolean) => void;
  onAction?: (action: ActionRequest) => Promise<void>;
  listHandles: string[];
}

type MenuState = { at: MenuPoint; confirmingCloseAll: boolean };

function AgentRow({
  agent,
  now,
  showRepo,
  renderCard,
  initiallyExpanded,
  onJump,
  workers,
  onReorder,
  onAction,
  listHandles,
}: AgentRowProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = () => setMenu(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null);
  const [dragging, setDragging] = useState(false);
  const edgeOf = (event: React.DragEvent<HTMLElement>): DropEdge => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  const [replying, setReplying] = useState(false);
  const working = agent.state === "working";
  const files = agent.artifacts.filter((artifact) => artifact.kind !== "pr").length;
  const terminalHandle = agent.terminalHandle;
  const workersBusy = workers.filter((worker) => worker.state === "working").length;

  return (
    <li
      data-jump={agent.id}
      onDragOver={(event: React.DragEvent<HTMLLIElement>) => {
        if (!onReorder || !event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (!dragging) setDropEdge(edgeOf(event));
      }}
      onDragLeave={(event: React.DragEvent<HTMLLIElement>) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setDropEdge(null);
      }}
      onDrop={(event: React.DragEvent<HTMLLIElement>) => {
        setDropEdge(null);
        const draggedId = event.dataTransfer.getData(SESSION_DRAG_TYPE);
        if (!onReorder || !draggedId) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggedId !== agent.id) onReorder(draggedId, agent.id, edgeOf(event) === "after");
      }}
      className="scroll-mt-6 border-b border-hair"
    >
      {dropEdge === "before" && <DropSlot />}
      <div
        onContextMenu={(event: React.MouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          setMenu({ at: { x: event.clientX, y: event.clientY }, confirmingCloseAll: false });
        }}
        className={`group flex items-center gap-2 hover:bg-tint ${menu ? "bg-tint" : ""} ${dragging ? "opacity-40" : ""}`}
      >
        {onReorder && (
          <span
            draggable
            onDragStart={(event: React.DragEvent<HTMLSpanElement>) => {
              event.dataTransfer.setData(SESSION_DRAG_TYPE, agent.id);
              event.dataTransfer.effectAllowed = "move";
              const row = event.currentTarget.parentElement;
              if (row) {
                const rect = row.getBoundingClientRect();
                event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
              }
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            title="끌어서 세션 순서를 바꿔요"
            className="-mr-1 flex shrink-0 cursor-grab self-stretch items-center px-1 text-faint group-hover:text-muted active:cursor-grabbing"
          >
            {ACTION_ICONS.drag}
          </span>
        )}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left text-[14px]"
        >
          <StateBadge agent={agent} />
          {showRepo && (
            <span className="w-56 shrink-0 truncate font-semibold">
              {agent.repo}
              <span className="font-normal text-muted"> / {agent.worktreeName}</span>
            </span>
          )}
          {agent.unread && <span className="size-2 shrink-0 rounded-full bg-accent" title="새 결과" />}
          <span className="min-w-0 flex-1 truncate text-muted">
            {agent.session?.title && <span className="font-semibold text-fg">{agent.session.title} · </span>}
            {parseMessage(agent.lastMessage)?.lead ?? agent.prompt}
          </span>
          {workers.length > 0 && (
            <span className="shrink-0 text-[12px] text-muted" title="이 세션이 오케스트레이션으로 띄운 작업 세션">
              작업 세션 {workers.length}
              {workersBusy > 0 && <span className="text-now"> · 작업 중 {workersBusy}</span>}
            </span>
          )}
          {files > 0 && <span className="text-[12px] text-muted">산출물 {files}</span>}
          {agent.session && (
            <BookmarkMark
              target={bookmarkTarget(agent.session.id, agent.session.title ?? "", agent.worktreePath, agent.session.bookmark)}
            />
          )}
          <span className="w-20 shrink-0 text-right text-[12px] text-muted">
            {working ? `${formatElapsed(agent.stateSince, now)} 경과` : `${formatElapsed(agent.updatedAt, now)} 전`}
          </span>
        </button>
        {terminalHandle && !expanded && (
          <button
            type="button"
            aria-pressed={replying}
            onClick={() => setReplying(!replying)}
            className={`shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold ${
              replying ? "bg-fg text-bg" : "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
            }`}
          >
            답장
          </button>
        )}
        {onJump && (
          <button
            type="button"
            onClick={() => onJump(agent)}
            title="이 프로젝트 화면에서 열기"
            className="shrink-0 rounded-full px-3 py-1 text-[12px] leading-5 font-semibold text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
          >
            이동 →
          </button>
        )}
      </div>
      {menu && (
        <ContextMenu at={menu.at} label={`${agent.session?.title ?? agent.worktreeName} 세션 메뉴`} onClose={closeMenu}>
          {menu.confirmingCloseAll && onAction ? (
            <div className="flex flex-col gap-2 p-2">
              <p>이 목록의 세션 {listHandles.length}개를 닫을까요?</p>
              <p className="text-[12px] text-muted">세션 기록은 남아서 세션 목록에서 다시 열 수 있어요.</p>
              <div className="flex justify-end gap-1.5">
                <MenuItem onSelect={closeMenu}>취소</MenuItem>
                <MenuItem
                  tone="danger"
                  onSelect={() => {
                    closeMenu();
                    void onAction({ type: "close-terminals", terminalHandles: listHandles });
                  }}
                >
                  모두 닫기
                </MenuItem>
              </div>
            </div>
          ) : (
            <>
              <MenuItem
                onSelect={() => {
                  closeMenu();
                  setExpanded(!expanded);
                }}
              >
                {expanded ? "접기" : "펼치기"}
              </MenuItem>
              {terminalHandle && !expanded && (
                <MenuItem
                  onSelect={() => {
                    closeMenu();
                    setReplying(true);
                  }}
                >
                  답장
                </MenuItem>
              )}
              {terminalHandle && onAction && (
                <MenuItem
                  onSelect={() => {
                    closeMenu();
                    void onAction({ type: "focus-terminal", terminalHandle });
                  }}
                >
                  Orca에서 이어가기
                </MenuItem>
              )}
              {onJump && (
                <MenuItem
                  onSelect={() => {
                    closeMenu();
                    onJump(agent);
                  }}
                >
                  프로젝트 화면에서 열기
                </MenuItem>
              )}
              {onAction && (terminalHandle || listHandles.length > 0) && <MenuSeparator />}
              {terminalHandle && onAction && (
                <MenuItem
                  tone="danger"
                  onSelect={() => {
                    closeMenu();
                    void onAction({ type: "close-terminal", terminalHandle });
                  }}
                >
                  세션 닫기
                </MenuItem>
              )}
              {onAction && listHandles.length > 0 && (
                <MenuItem
                  tone="danger"
                  hint={`${listHandles.length}개`}
                  onSelect={() => setMenu({ ...menu, confirmingCloseAll: true })}
                >
                  이 목록 세션 모두 닫기
                </MenuItem>
              )}
            </>
          )}
        </ContextMenu>
      )}
      {terminalHandle && replying && !expanded && (
        <div className="pb-3">
          <QuickReply terminalHandle={terminalHandle} working={working} autoFocus />
        </div>
      )}
      {expanded && <div className="pb-4">{renderCard(agent)}</div>}
      {expanded && workers.length > 0 && (
        <div className="mb-4 ml-6">
          <AgentList agents={workers} now={now} showRepo={showRepo} renderCard={renderCard} onAction={onAction} />
        </div>
      )}
      {dropEdge === "after" && <DropSlot />}
    </li>
  );
}
