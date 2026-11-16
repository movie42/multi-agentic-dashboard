"use client";

import type { AgentCard } from "@/common/board/types";
import { appendDraft } from "@/client/shared/lib/useDraft";
import { toastError, useToastStore } from "@/client/shared/model/toastStore";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { relativeTo } from "../../lib/paths";

interface FileContextMenuProps {
  at: MenuPoint;
  path: string;
  isDir: boolean;
  root: string;
  agents: readonly AgentCard[];
  onClose: () => void;
}

function sessionTitle(agent: AgentCard): string {
  return agent.session?.title ?? agent.title ?? agent.prompt?.split("\n")[0] ?? "제목 없음";
}

export function FileContextMenu({ at, path, isDir, root, agents, onClose }: FileContextMenuProps) {
  const showToast = useToastStore((state) => state.show);
  const relative = relativeTo(root, path);
  const mention = `@${relative}${isDir ? "/" : ""}`;
  const sessions = agents.filter(
    (agent): agent is AgentCard & { terminalHandle: string } => agent.worktreePath === root && agent.terminalHandle !== null,
  );

  const [onlySession] = sessions;

  const copy = async (text: string) => {
    onClose();
    try {
      await navigator.clipboard.writeText(text);
      showToast("경로를 복사했어요.", "info");
    } catch (error) {
      toastError("copy-path", error);
    }
  };

  const send = (agent: AgentCard & { terminalHandle: string }) => {
    onClose();
    try {
      appendDraft(`quick-reply-draft:${agent.terminalHandle}`, mention);
      showToast(`'${sessionTitle(agent)}' 입력창에 ${mention}을 넣었어요.`, "info");
    } catch (error) {
      toastError("send-path", error);
    }
  };

  return (
    <ContextMenu at={at} label={`${relative} 메뉴`} onClose={onClose} widthClass="w-64">
      <MenuItem onSelect={() => void copy(path)}>경로 복사</MenuItem>
      <MenuItem onSelect={() => void copy(relative)}>상대 경로 복사</MenuItem>
      <MenuSeparator />
      {sessions.length === 0 && (
        <MenuItem onSelect={onClose} disabled description="이 워크트리에 열린 세션이 없어요">
          세션에 보내기
        </MenuItem>
      )}
      {sessions.length === 1 && onlySession && (
        <MenuItem onSelect={() => send(onlySession)} description={sessionTitle(onlySession)}>
          세션에 보내기
        </MenuItem>
      )}
      {sessions.length > 1 && (
        <>
          <MenuHeading>세션에 보내기</MenuHeading>
          {sessions.map((agent) => (
            <MenuItem key={agent.id} onSelect={() => send(agent)}>
              <span className="line-clamp-1">{sessionTitle(agent)}</span>
            </MenuItem>
          ))}
        </>
      )}
    </ContextMenu>
  );
}
