"use client";

import { docWindowUrl, type DocTab } from "@/client/features/view-doc";
import { useToastStore } from "@/client/shared/model/toastStore";

// A custom type only: Finder turns text or URL drag data dropped on the desktop into a file.
const DRAG_TYPE = "application/x-agent-control-doc";

interface DocTabButtonProps {
  tab: DocTab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}

function droppedOutsideWindow(event: React.DragEvent<HTMLElement>): boolean {
  const { screenX, screenY } = event;
  if (screenX === 0 && screenY === 0) return false;
  return (
    screenX < window.screenX ||
    screenX > window.screenX + window.outerWidth ||
    screenY < window.screenY ||
    screenY > window.screenY + window.outerHeight
  );
}

export function DocTabButton({ tab, active, onActivate, onClose }: DocTabButtonProps) {
  const showToast = useToastStore((state) => state.show);

  const detach = (event: React.DragEvent<HTMLElement>) => {
    if (!droppedOutsideWindow(event)) return;
    const width = Math.min(1200, window.screen.availWidth);
    const height = Math.min(960, window.screen.availHeight);
    const features = `popup,width=${width},height=${height},left=${event.screenX - 120},top=${event.screenY - 16}`;
    if (!window.open(docWindowUrl(tab.current), "_blank", features)) {
      showToast("새 창을 열지 못했어요. 팝업 차단을 확인해 주세요.", "error");
      return;
    }
    onClose();
  };

  return (
    <div
      role="tab"
      aria-selected={active}
      draggable
      onDragStart={(event: React.DragEvent<HTMLDivElement>) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DRAG_TYPE, tab.current);
      }}
      onDragEnd={detach}
      onClick={onActivate}
      onAuxClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button === 1) onClose();
      }}
      title={`${tab.current}\n창 밖으로 끌면 별도 창으로 열려요`}
      className={`group flex max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border-x border-t px-3 py-1.5 text-[13px] select-none ${
        active ? "border-hair bg-bg font-semibold" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      <span className="truncate">{tab.title}</span>
      <button
        type="button"
        aria-label={`${tab.title} 닫기`}
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
