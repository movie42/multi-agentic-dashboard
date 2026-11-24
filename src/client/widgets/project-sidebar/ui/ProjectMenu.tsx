"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { boardKeys } from "@/client/entities/board";
import { openWorkspaceWindow } from "@/client/entities/workspace";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { ContextMenu, MenuItem, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { MenuGroups } from "@/client/shared/ui/MenuGroups";

interface ProjectMenuProps {
  repo: string;
  at: MenuPoint;
  focused: boolean;
  modeLabel: string;
  onOpen: () => void;
  onToggleFocus: () => void;
  onToggleMode: () => void;
  /** Called once the project is off the list, so a view showing it can let go. */
  onRemoved: () => void;
  onClose: () => void;
}

/** The right-click menu on a project in the sidebar. Removing only takes it off the list; nothing on disk is touched. */
export function ProjectMenu({ repo, at, focused, modeLabel, onOpen, onToggleFocus, onToggleMode, onRemoved, onClose }: ProjectMenuProps) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const pick = (run: () => void) => () => {
    run();
    onClose();
  };
  const remove = async () => {
    onClose();
    try {
      await postAction({ type: "remove-project", repo });
      onRemoved();
      await queryClient.invalidateQueries({ queryKey: boardKeys.all });
    } catch (error) {
      toastError("remove-project", error);
    }
  };

  // Portaled: the sidebar is position:fixed, so a menu inside it stays under the main area whatever its z-index.
  return createPortal(
    <ContextMenu at={at} label={`${repo} 프로젝트 메뉴`} onClose={onClose} widthClass="w-60">
      {confirming ? (
        <div className="flex flex-col gap-2 p-2">
          <p>{repo} 프로젝트를 목록에서 뺄까요?</p>
          <p className="text-[12px] text-muted">폴더와 워크트리, 세션은 그대로 남아요. 프로젝트 불러오기로 다시 넣을 수 있어요.</p>
          <div className="flex justify-end gap-1.5">
            <MenuItem onSelect={onClose}>취소</MenuItem>
            <MenuItem tone="danger" onSelect={() => void remove()}>
              목록에서 빼기
            </MenuItem>
          </div>
        </div>
      ) : (
        <MenuGroups
          at={at}
          groups={[
            {
              label: "열기",
              items: [
                <MenuItem key="open" onSelect={pick(onOpen)}>
                  열기
                </MenuItem>,
                <MenuItem key="window" description="이 창은 그대로 두고 따로 떠 있는 창으로 열어요" onSelect={pick(() => openWorkspaceWindow(repo))}>
                  새 창에서 열기
                </MenuItem>,
              ],
            },
            {
              label: "정리",
              items: [
                <MenuItem key="focus" hint="⌘ 클릭" onSelect={pick(onToggleFocus)}>
                  {focused ? "포커스에서 빼기" : "포커스에 넣기"}
                </MenuItem>,
                <MenuItem key="mode" description={`지금은 ${modeLabel} 워크플로`} onSelect={pick(onToggleMode)}>
                  워크플로 바꾸기
                </MenuItem>,
              ],
            },
            {
              label: "닫기·지우기",
              items: [
                <MenuItem key="remove" tone="danger" description="폴더는 지우지 않아요" onSelect={() => setConfirming(true)}>
                  프로젝트 목록에서 빼기
                </MenuItem>,
              ],
            },
          ]}
        />
      )}
    </ContextMenu>,
    document.body,
  );
}
