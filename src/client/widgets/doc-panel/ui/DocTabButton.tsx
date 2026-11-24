"use client";

import { docWindowUrl, fileWindowUrl, type DocTab } from "@/client/features/view-doc";
import { openWindow } from "@/client/shared/lib/openWindow";
import { DETACH_HINT, detachDrag } from "./detachDrag";

interface DocTabButtonProps {
  tab: DocTab;
  active: boolean;
  onActivate: () => void;
  onPin: () => void;
  onClose: () => void;
}

export function DocTabButton({ tab, active, onActivate, onPin, onClose }: DocTabButtonProps) {
  const detach = detachDrag(tab.current, (at) => {
    const url = tab.kind === "file" ? fileWindowUrl(tab.current) : docWindowUrl(tab.current);
    if (openWindow(url, { width: 1200, height: 960 }, "_blank", at)) onClose();
  });

  return (
    <div
      role="tab"
      aria-selected={active}
      {...detach}
      onClick={onActivate}
      onDoubleClick={onPin}
      onAuxClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button === 1) onClose();
      }}
      title={`${tab.current}\n${tab.preview ? "미리보기 탭 · 두 번 누르면 고정돼요\n" : ""}${DETACH_HINT}`}
      className={`group flex max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-t-md border-x border-t px-3 py-1.5 text-[13px] select-none ${
        active ? "border-hair bg-bg font-semibold" : "border-transparent text-muted hover:text-fg"
      }`}
    >
      <span className={`truncate ${tab.preview ? "italic" : ""}`}>{tab.title}</span>
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
