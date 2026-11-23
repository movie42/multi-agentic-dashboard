"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { boardKeys } from "@/client/entities/board";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";

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

  return (
    <ContextMenu at={at} label={`${repo} 프로젝트 메뉴`} onClose={onClose} widthClass="w-64">
      <MenuHeading>프로젝트 · {repo}</MenuHeading>
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
        <>
          <MenuItem onSelect={pick(onOpen)}>열기</MenuItem>
          <MenuSeparator />
          <MenuItem hint="⌘ 클릭" onSelect={pick(onToggleFocus)}>
            {focused ? "포커스에서 빼기" : "포커스에 넣기"}
          </MenuItem>
          <MenuItem description={`지금은 ${modeLabel} 워크플로`} onSelect={pick(onToggleMode)}>
            워크플로 바꾸기
          </MenuItem>
          <MenuSeparator />
          <MenuItem tone="danger" description="폴더는 지우지 않아요" onSelect={() => setConfirming(true)}>
            프로젝트 목록에서 빼기
          </MenuItem>
        </>
      )}
    </ContextMenu>
  );
}
