"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/board/types";
import { UNSEEN_TURN_DOT, useUnseenTurns } from "@/client/entities/agent";
import { useTerminalRequest } from "@/client/entities/runner";
import { addArea, areaOf, assignArea, removeArea, renameArea, splitByArea, toggleArea, useSessionAreas, type SessionArea } from "@/client/entities/session-area";
import { ContextMenu, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
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

function dotTone(agent: AgentCard, needsMe: boolean, unseen: boolean): string {
  if (unseen) return UNSEEN_TURN_DOT;
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
  /** Underlined in the area colour: the tab sits in a named area. */
  inArea?: boolean;
  onContextMenu?: (at: MenuPoint) => void;
}

function SessionTab({ agent, selected, needsMe, onSelect, onClose, onReorder, workerCount = 0, label, inArea = false, onContextMenu }: SessionTabProps) {
  const terminalRequest = useTerminalRequest(agent.terminalHandle);
  const unseenTurns = useUnseenTurns();
  const unseen = unseenTurns.isUnseen(agent);
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
      onContextMenu={
        onContextMenu
          ? (event: React.MouseEvent<HTMLLIElement>) => {
              event.preventDefault();
              onContextMenu({ x: event.clientX, y: event.clientY });
            }
          : undefined
      }
      className={`group/tab relative flex shrink-0 items-center rounded-t-lg ${
        selected ? "bg-tint" : "hover:bg-tint/60"
      } ${dragging ? "opacity-40" : ""} ${inArea ? "border-b-2 border-focus/60" : ""}`}
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
        onClick={() => {
          unseenTurns.markSeen([agent]);
          onSelect();
        }}
        title={`${title}${needsMe ? " · 내 차례" : ""}`}
        className={`flex max-w-60 items-center gap-2 py-2 pl-3 text-[13px] leading-none ${onClose ? "pr-1" : "pr-3"} ${
          selected ? "font-semibold text-fg" : "text-muted hover:text-fg"
        }`}
      >
        <span className={`size-2 shrink-0 rounded-full ${dotTone(agent, needsMe, unseen)}`} />
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

interface AreaHeaderProps {
  area: SessionArea;
  count: number;
  needsMe: boolean;
  /** One of its tabs is the selected one, hidden while the area is folded. */
  holdsSelected: boolean;
  renaming: boolean;
  onToggle: () => void;
  onRename: (name: string | null) => void;
  onContextMenu: (at: MenuPoint) => void;
  onDropSession: (sessionId: string) => void;
}

/** A named area's chip in the tab strip; its tabs follow it until the next chip. Click folds them away. */
function AreaHeader({ area, count, needsMe, holdsSelected, renaming, onToggle, onRename, onContextMenu, onDropSession }: AreaHeaderProps) {
  const [dropping, setDropping] = useState(false);
  // Enter or Escape already settled it; a blur from the input leaving the page must not rename again.
  const settled = useRef(false);
  const finish = (value: string | null) => {
    if (settled.current) return;
    settled.current = true;
    onRename(value === null ? null : value.trim() || null);
  };
  return (
    <li
      role="presentation"
      onDragOver={(event: React.DragEvent<HTMLLIElement>) => {
        if (!event.dataTransfer.types.includes(SESSION_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event: React.DragEvent<HTMLLIElement>) => {
        setDropping(false);
        const draggedId = event.dataTransfer.getData(SESSION_DRAG_TYPE);
        if (!draggedId) return;
        event.preventDefault();
        onDropSession(draggedId);
      }}
      onContextMenu={(event: React.MouseEvent<HTMLLIElement>) => {
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY });
      }}
      className={`mb-1 ml-1.5 flex shrink-0 items-center first:ml-0 ${dropping ? "rounded-md ring-2 ring-focus" : ""}`}
    >
      {renaming ? (
        <input
          autoFocus
          aria-label="영역 이름"
          defaultValue={area.name}
          onFocus={(event: React.FocusEvent<HTMLInputElement>) => {
            settled.current = false;
            event.currentTarget.select();
          }}
          onBlur={(event: React.FocusEvent<HTMLInputElement>) => finish(event.currentTarget.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") finish(event.currentTarget.value);
            if (event.key === "Escape") finish(null);
          }}
          className="w-32 rounded-md bg-bg px-2 py-1 text-[12px] font-semibold text-focus outline-none ring-1 ring-focus"
        />
      ) : (
        <button
          type="button"
          data-area-header={area.id}
          aria-expanded={!area.collapsed}
          onClick={onToggle}
          onDoubleClick={() => onRename(area.name)}
          title={`${area.name} · 눌러서 ${area.collapsed ? "펼치기" : "접기"}, 두 번 눌러 이름 바꾸기`}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] leading-none font-semibold ${
            holdsSelected && area.collapsed ? "bg-focus text-bg" : "bg-focus/10 text-focus hover:bg-focus/20"
          }`}
        >
          {needsMe && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
          <span className="max-w-40 truncate">{area.name}</span>
          <span className="font-normal opacity-70">{count}</span>
          <span aria-hidden className="text-[10px] opacity-70">
            {area.collapsed ? "▸" : "▾"}
          </span>
        </button>
      )}
    </li>
  );
}

type StripMenu = { at: MenuPoint; kind: "tab"; agentId: string } | { at: MenuPoint; kind: "area"; areaId: string };

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
  const [areas, updateAreas] = useSessionAreas(worktreeId);
  const split = splitByArea(agents, areas);
  const [menu, setMenu] = useState<StripMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const closeMenu = () => setMenu(null);
  const createArea = (memberIds: string[]) => {
    const id = crypto.randomUUID();
    updateAreas((current) => addArea(current, id, "새 영역", memberIds));
    setRenamingId(id);
  };
  /** A tab dropped on another tab joins that tab's area, or leaves every area when the target is in none. */
  const dropOnTab = (draggedId: string, targetId: string, placeAfter: boolean) => {
    updateAreas((current) => assignArea(current, [draggedId], areaOf(current, targetId)?.id ?? null));
    onReorder?.(draggedId, targetId, placeAfter);
  };
  const renderTab = (agent: AgentCard, inArea: boolean) => {
    const terminalHandle = agent.terminalHandle;
    return (
      <SessionTab
        key={agent.id}
        agent={agent}
        selected={agent.id === selected?.id}
        needsMe={needsMeIds.has(agent.id)}
        onSelect={() => select(agent.id)}
        onClose={terminalHandle ? () => void onAction({ type: "close-terminal", terminalHandle }) : null}
        onReorder={onReorder ? dropOnTab : undefined}
        workerCount={workersOf(agent).length}
        inArea={inArea}
        onContextMenu={(at) => setMenu({ at, kind: "tab", agentId: agent.id })}
      />
    );
  };
  const menuArea = menu?.kind === "area" ? (areas.find((area) => area.id === menu.areaId) ?? null) : null;
  const menuTabArea = menu?.kind === "tab" ? areaOf(areas, menu.agentId) : null;
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
            {split.unassigned.map((agent) => renderTab(agent, false))}
            {split.sections.map(({ area, items }) => [
              <AreaHeader
                key={`area:${area.id}`}
                area={area}
                count={items.length}
                needsMe={items.some((agent) => needsMeIds.has(agent.id))}
                holdsSelected={items.some((agent) => agent.id === selected?.id)}
                renaming={renamingId === area.id}
                onToggle={() => updateAreas((current) => toggleArea(current, area.id))}
                onRename={(name) => {
                  if (renamingId !== area.id) {
                    setRenamingId(area.id);
                    return;
                  }
                  setRenamingId(null);
                  if (name && name !== area.name) updateAreas((current) => renameArea(current, area.id, name));
                }}
                onContextMenu={(at) => setMenu({ at, kind: "area", areaId: area.id })}
                onDropSession={(sessionId) => updateAreas((current) => assignArea(current, [sessionId], area.id))}
              />,
              ...(area.collapsed ? [] : items.map((agent) => renderTab(agent, true))),
            ])}
          </ul>
          <button
            type="button"
            data-new-area
            aria-label="영역 추가"
            title="이 워크트리에 이름 붙인 영역을 만들어요. 탭을 끌어다 넣거나 탭 메뉴로 옮겨요"
            onClick={() => createArea([])}
            className="mb-1 ml-1 shrink-0 rounded-md px-1.5 py-1 text-[12px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
          >
            영역
          </button>
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
      {menu?.kind === "tab" && (
        <ContextMenu at={menu.at} label="세션 탭" onClose={closeMenu}>
          {areas
            .filter((area) => area.id !== menuTabArea?.id)
            .map((area) => (
              <MenuItem
                key={area.id}
                onSelect={() => {
                  closeMenu();
                  updateAreas((current) => assignArea(current, [menu.agentId], area.id));
                }}
              >
                &apos;{area.name}&apos;(으)로 옮기기
              </MenuItem>
            ))}
          <MenuItem
            onSelect={() => {
              closeMenu();
              createArea([menu.agentId]);
            }}
          >
            새 영역으로 옮기기
          </MenuItem>
          {menuTabArea && (
            <>
              <MenuSeparator />
              <MenuItem
                onSelect={() => {
                  closeMenu();
                  updateAreas((current) => assignArea(current, [menu.agentId], null));
                }}
              >
                영역에서 빼기
              </MenuItem>
            </>
          )}
        </ContextMenu>
      )}
      {menuArea && menu && (
        <ContextMenu at={menu.at} label={`영역 · ${menuArea.name}`} onClose={closeMenu}>
          <MenuItem
            onSelect={() => {
              closeMenu();
              setRenamingId(menuArea.id);
            }}
          >
            이름 바꾸기
          </MenuItem>
          <MenuItem
            onSelect={() => {
              closeMenu();
              updateAreas((current) => toggleArea(current, menuArea.id));
            }}
          >
            {menuArea.collapsed ? "펼치기" : "접기"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            tone="danger"
            description="안의 세션은 영역 밖으로 나와요"
            onSelect={() => {
              closeMenu();
              updateAreas((current) => removeArea(current, menuArea.id));
            }}
          >
            영역 지우기
          </MenuItem>
        </ContextMenu>
      )}
      {shown && (
        <div role="tabpanel" className="flex flex-col gap-4 pt-0">
          {renderCard(shown)}
        </div>
      )}
    </div>
  );
}
