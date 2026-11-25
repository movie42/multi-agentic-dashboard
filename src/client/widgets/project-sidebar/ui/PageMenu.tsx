"use client";

import { createPortal } from "react-dom";
import { openPageWindow, type WorkspacePage } from "@/client/entities/workspace";
import { ContextMenu, MenuItem, type MenuPoint } from "@/client/shared/ui/ContextMenu";

interface PageMenuProps {
  page: WorkspacePage;
  label: string;
  at: MenuPoint;
  onOpen: () => void;
  onClose: () => void;
}

/** The right-click menu on a sidebar page (지난 세션, 할일, 변경). */
export function PageMenu({ page, label, at, onOpen, onClose }: PageMenuProps) {
  const pick = (run: () => void) => () => {
    run();
    onClose();
  };
  // Portaled for the same reason as ProjectMenu: the fixed sidebar would keep it under the main area.
  return createPortal(
    <ContextMenu at={at} label={`${label} 메뉴`} onClose={onClose} widthClass="w-60">
      <MenuItem onSelect={pick(onOpen)}>열기</MenuItem>
      <MenuItem description={`${label}만 보이는 창으로 따로 띄워요`} onSelect={pick(() => openPageWindow(page))}>
        새 창에서 열기
      </MenuItem>
    </ContextMenu>,
    document.body,
  );
}
