"use client";

import { useEffect } from "react";
import { targetOfDocUrl, useDocViewerStore } from "@/client/features/view-doc";
import { paneWidth } from "@/client/shared/lib/paneWidth";
import { ResizeHandle } from "@/client/shared/ui/ResizeHandle";
import { DocFrame } from "./DocFrame";
import { DocTabButton } from "./DocTabButton";
import { openInBrowser } from "./openInBrowser";
import type { AgentCard } from "@/common/orca/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError, useToastStore } from "@/client/shared/model/toastStore";
import { handOffAnswers } from "../lib/handOffAnswers";

const MIN_WIDTH = 360;
const MIN_MAIN = 400;

const sidebarWidth = () =>
  window.innerWidth >= 768 && !document.documentElement.hasAttribute("data-sidebar-collapsed")
    ? paneWidth("--sidebar-w", 288)
    : 0;

interface DocPanelProps {
  agents: readonly AgentCard[];
}

function isSendRequest(data: unknown): data is { type: "flow-answers-send"; page: string } {
  return (
    typeof data === "object" && data !== null && "type" in data && data.type === "flow-answers-send" &&
    "page" in data && typeof data.page === "string"
  );
}

export function DocPanel({ agents }: DocPanelProps) {
  const { tabs, active, activate, navigated, close, closeAll } = useDocViewerStore();
  const showToast = useToastStore((state) => state.show);
  const activeTab = tabs.find((tab) => tab.target === active) ?? null;
  const isOpen = tabs.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeAll]);

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
      className="fixed inset-y-0 right-0 z-40 flex w-[var(--doc-panel-w,50vw)] flex-col border-l border-hair bg-bg"
    >
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
      <header className="flex items-end gap-2 border-b border-hair bg-tint px-3 pt-2">
        <div role="tablist" className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <DocTabButton
              key={tab.target}
              tab={tab}
              active={tab.target === active}
              onActivate={() => activate(tab.target)}
              onClose={() => close(tab.target)}
            />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3 pb-2 text-[13px]">
          {activeTab && (
            <button
              type="button"
              onClick={() => openInBrowser(activeTab.current)}
              className="underline decoration-faint underline-offset-[3px] hover:decoration-current"
            >
              브라우저로 열기
            </button>
          )}
          <button
            type="button"
            aria-label="문서 패널 닫기"
            title="닫기 (Esc)"
            onClick={closeAll}
            className="rounded px-1.5 text-[16px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
          >
            ×
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <DocFrame
            key={tab.target}
            target={tab.target}
            onNavigate={(current, label) => navigated(tab.target, current, label)}
            className={`absolute inset-0 ${tab.target === active ? "" : "invisible"}`}
          />
        ))}
      </div>
    </aside>
  );
}
