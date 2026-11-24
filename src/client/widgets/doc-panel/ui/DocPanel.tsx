"use client";

import { useEffect, useRef, useState } from "react";
import { acceptsSessionDrag, droppedSessionId } from "@/client/entities/agent";
import { useFileExplorerStore } from "@/client/features/browse-files";
import { targetOfDocUrl, useDocViewerStore } from "@/client/features/view-doc";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { FileTree } from "./files/FileTree";
import { FileView } from "./files/FileView";
import { paneWidth } from "@/client/shared/lib/paneWidth";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle";
import { DocFrame } from "./DocFrame";
import { DocTabButton } from "./DocTabButton";
import { DETACH_HINT, useDetachDrag } from "./detachDrag";
import type { ScreenPoint } from "@/client/shared/lib/openWindow";
import { openInBrowser } from "./openInBrowser";
import type { AgentCard } from "@/common/board/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError, useToastStore } from "@/client/shared/model/toastStore";
import { handOffAnswers } from "../lib/handOffAnswers";

const MIN_WIDTH = 360;
const TREE_MIN = 180;
const MIN_MAIN = 400;

const sidebarWidth = () =>
  window.innerWidth >= 768 && !document.documentElement.hasAttribute("data-sidebar-collapsed")
    ? paneWidth("--sidebar-w", 288)
    : 0;

const CANVAS_MIN = 320;
const CANVAS_ROOM = 400;

/** One tab a host puts before the document tabs — a session the canvas opened, or its current selection. */
export interface PanelLeadTab {
  id: string;
  label: string;
  content: React.ReactNode;
  closable: boolean;
  /** Given: dropping the tab outside the app hands it to the host to open in its own window. */
  onDetach?: (at: ScreenPoint) => void;
  /** A session tab: another window's tab strip can take it. */
  sessionId?: string;
  /** The tab landed in another window's tab strip. */
  onMoved?: () => void;
}

/** What a host puts before the document tabs — the canvas puts its session tabs there. */
export interface PanelLead {
  tabs: PanelLeadTab[];
  /** Shown whenever no document tab is active. */
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onCollapse: () => void;
  /** Given: a session tab dragged here from another window becomes a tab of this panel. */
  onDropSession?: (agentId: string) => void;
}

interface DocPanelProps {
  agents: readonly AgentCard[];
  /** Given: the panel sits inside the host's layout, stays open, and its first tab shows this. */
  lead?: PanelLead;
}

function isSendRequest(data: unknown): data is { type: "flow-answers-send"; page: string } {
  return (
    typeof data === "object" && data !== null && "type" in data && data.type === "flow-answers-send" &&
    "page" in data && typeof data.page === "string"
  );
}

export function DocPanel({ agents, lead }: DocPanelProps) {
  const { tabs, active: stored, activate, navigated, pin, close, closeAll: closeTabs } = useDocViewerStore();
  const { root, treeOpen, show, hide } = useFileExplorerStore();
  const showToast = useToastStore((state) => state.show);
  const embedded = lead !== undefined;
  // Without a lead tab there is always a document to show; with one, no document means the lead.
  const activeTab = tabs.find((tab) => tab.target === stored) ?? (embedded ? null : (tabs[0] ?? null));
  const active = activeTab?.target ?? null;
  const activeFile = activeTab?.kind === "file" ? activeTab.target : null;
  const showTree = treeOpen && root !== null;
  const isOpen = embedded || tabs.length > 0 || showTree;
  const interceptReload = embedded ? activeTab !== null : isOpen;
  const closeAll = () => {
    closeTabs();
    hide();
  };
  const framesRef = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const onDropSession = lead?.onDropSession;
  const takesSession = (event: React.DragEvent<HTMLDivElement>) => onDropSession !== undefined && acceptsSessionDrag(event.dataTransfer);
  const reloadActive = () =>
    framesRef.current?.querySelector<HTMLIFrameElement>("iframe[data-active]")?.contentWindow?.location.reload();

  useEffect(() => {
    void useDocViewerStore.persist.rehydrate();
    void useFileExplorerStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!interceptReload) return;
    const onReload = (event: Event) => {
      event.preventDefault();
      reloadActive();
    };
    window.addEventListener("agent-control:reload", onReload);
    return () => window.removeEventListener("agent-control:reload", onReload);
  }, [interceptReload]);

  useEffect(() => {
    // Inside the canvas, Escape clears the canvas selection; it should not throw the documents away.
    if (!isOpen || embedded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      useDocViewerStore.getState().closeAll();
      useFileExplorerStore.getState().hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, embedded]);

  useEffect(() => {
    if (!isOpen) return;
    const onMessage = async (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !isSendRequest(event.data)) return;
      const reply = (ok: boolean) => event.source?.postMessage({ type: "flow-answers-sent", ok }, { targetOrigin: window.location.origin });
      const page = targetOfDocUrl(event.data.page);
      const handOff = page ? handOffAnswers(agents, page) : null;
      if (!handOff) {
        showToast("flow 작업 문서가 아니라서 보낼 곳을 찾지 못했어요.", "error");
        reply(false);
        return;
      }
      try {
        await postAction(handOff.action);
        showToast(handOff.where === "session" ? "문서를 만든 세션에 답을 보냈어요." : "문서를 만든 세션이 닫혀 있어서 새 세션에 보냈어요.", "info");
        reply(true);
      } catch (error) {
        toastError("send-flow-answers", error);
        reply(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isOpen, agents, showToast]);

  if (!isOpen) return null;

  return (
    <aside
      aria-label="문서"
      className={
        embedded
          ? "relative flex h-full w-[var(--canvas-panel-w,440px)] shrink-0 border-l border-hair bg-bg"
          : "fixed inset-y-0 right-0 z-40 flex w-[var(--doc-panel-w,50vw)] border-l border-hair bg-bg"
      }
    >
      {embedded ? (
        <ResizeHandle
          cssVar="--canvas-panel-w"
          storageKey="agent-control:canvas-panel-width"
          edge="left"
          defaultWidth={() => Math.min(440, window.innerWidth * 0.4)}
          min={CANVAS_MIN}
          max={() => window.innerWidth - paneWidth("--sidebar-w", 0) - CANVAS_ROOM}
          label="오른쪽 패널 크기 조절"
          className="absolute inset-y-0 -left-1 z-20"
        />
      ) : (
      <ResizeHandle
        cssVar="--doc-panel-w"
        storageKey="agent-control:doc-panel-width"
        edge="left"
        defaultWidth={() => (window.innerWidth - sidebarWidth()) / 2}
        min={MIN_WIDTH}
        max={() => window.innerWidth - sidebarWidth() - MIN_MAIN}
        label="문서 패널 크기 조절"
        className="absolute inset-y-0 -left-1"
      />
      )}
      {showTree && (
        <div className="relative w-[var(--file-tree-w,260px)] shrink-0 border-r border-hair bg-bg">
          <FileTree root={root} activeFile={activeFile} agents={agents} />
          <ResizeHandle
            cssVar="--file-tree-w"
            storageKey="agent-control:file-tree-width"
            edge="right"
            defaultWidth={() => 260}
            min={TREE_MIN}
            max={() => Math.max(TREE_MIN, paneWidth("--doc-panel-w", window.innerWidth / 2) - MIN_WIDTH / 2)}
            label="파일 트리 크기 조절"
            className="absolute inset-y-0 -right-1"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end gap-2 border-b border-hair bg-tint px-3 pt-2">
          {root && (
            <button
              type="button"
              aria-label={showTree ? "파일 트리 닫기" : "파일 트리 열기"}
              aria-pressed={showTree}
              title={showTree ? "파일 트리 닫기" : "파일 트리 열기"}
              onClick={() => (showTree ? hide() : show(root))}
              className={`mb-1.5 shrink-0 rounded-md p-0.5 hover:bg-tint-2 hover:text-fg ${showTree ? "text-fg" : "text-muted"}`}
            >
              {ACTION_ICONS.files}
            </button>
          )}
          <div
            role="tablist"
            onDragOver={(event: React.DragEvent<HTMLDivElement>) => {
              if (!takesSession(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(event: React.DragEvent<HTMLDivElement>) => {
              setDropping(false);
              if (!takesSession(event)) return;
              event.preventDefault();
              const agentId = droppedSessionId(event.dataTransfer);
              if (agentId) onDropSession?.(agentId);
            }}
            className={`flex min-h-9 min-w-0 flex-1 items-end gap-0.5 overflow-x-auto rounded-t-md ${dropping ? "bg-tint-2" : ""}`}
          >
            {lead?.tabs.map((tab) => (
              <LeadTabButton
                key={tab.id}
                tab={tab}
                active={active === null && tab.id === lead.activeId}
                onActivate={() => {
                  activate(null);
                  lead.onActivate(tab.id);
                }}
                onClose={() => lead.onClose(tab.id)}
              />
            ))}
            {tabs.map((tab) => (
              <DocTabButton
                key={tab.target}
                tab={tab}
                active={tab.target === active}
                onActivate={() => activate(tab.target)}
                onPin={() => pin(tab.target)}
                onClose={() => close(tab.target)}
              />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-3 pb-2 text-[13px]">
            {activeTab?.kind === "doc" && (
              <button
                type="button"
                title="새로고침 (⌘R)"
                onClick={reloadActive}
                className="underline decoration-faint underline-offset-[3px] hover:decoration-current"
              >
                새로고침
              </button>
            )}
            {activeTab?.kind === "doc" && (
              <button
                type="button"
                onClick={() => openInBrowser(activeTab.current)}
                className="underline decoration-faint underline-offset-[3px] hover:decoration-current"
              >
                브라우저로 열기
              </button>
            )}
            {lead ? (
              <button
                type="button"
                aria-label="오른쪽 패널 접기"
                title="오른쪽 패널 접기"
                onClick={lead.onCollapse}
                className="rounded px-1.5 text-[15px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
              >
                »
              </button>
            ) : (
              <button
                type="button"
                aria-label="문서 패널 닫기"
                title="닫기 (Esc)"
                onClick={closeAll}
                className="rounded px-1.5 text-[16px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
              >
                ×
              </button>
            )}
          </div>
        </header>
        <div ref={framesRef} className="relative min-h-0 flex-1">
          {lead?.tabs.map((tab) => (
            <div key={tab.id} className={`absolute inset-0 ${active === null && tab.id === lead.activeId ? "" : "invisible"}`}>
              {tab.content}
            </div>
          ))}
          {!lead && tabs.length === 0 && <p className="px-5 py-8 text-[13px] text-muted">트리에서 파일을 고르면 여기에 열려요.</p>}
          {tabs.map((tab) =>
            tab.kind === "file" ? (
              <FileView
                key={tab.target}
                file={tab.target}
                active={tab.target === active}
                root={root}
                className={`absolute inset-0 ${tab.target === active ? "" : "invisible"}`}
              />
            ) : (
              <DocFrame
                key={tab.target}
                target={tab.target}
                active={tab.target === active}
                onNavigate={(current, label) => navigated(tab.target, current, label)}
                className={`absolute inset-0 ${tab.target === active ? "" : "invisible"}`}
              />
            ),
          )}
        </div>
      </div>
    </aside>
  );
}

interface LeadTabButtonProps {
  tab: PanelLeadTab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}

const NO_DETACH = () => {};

function LeadTabButton({ tab, active, onActivate, onClose }: LeadTabButtonProps) {
  const drag = useDetachDrag(tab.id, tab.onDetach ?? NO_DETACH, { sessionId: tab.sessionId, onMoved: tab.onMoved });
  return (
    <div
      role="tab"
      aria-selected={active}
      {...(tab.onDetach ? drag : {})}
      onClick={onActivate}
      onAuxClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button === 1 && tab.closable) onClose();
      }}
      title={tab.onDetach ? `${tab.label}\n${DETACH_HINT}` : tab.label}
      className={`group flex max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border-x border-t px-3 py-1.5 text-[13px] select-none ${
        active ? "border-hair bg-bg font-semibold" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      <span className="truncate">{tab.label}</span>
      {tab.closable && (
        <button
          type="button"
          aria-label={`${tab.label} 닫기`}
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onClose();
          }}
          className="rounded px-1 leading-none text-muted opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 hover:bg-tint-2 hover:text-fg"
        >
          ×
        </button>
      )}
    </div>
  );
}
