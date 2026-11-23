"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { DevPort } from "@/common/devPorts/types";
import { postAction } from "@/client/shared/api/actions";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { toastError } from "@/client/shared/model/toastStore";
import { ContextMenu, MenuHeading, MenuItem, MenuSeparator, type MenuPoint } from "@/client/shared/ui/ContextMenu";
import { DEV_PORTS_KEY, useDevPorts } from "../api/devPortsQuery";

const HIDDEN_KEY = "agent-control:hidden-dev-ports";

interface DevPortBadgesProps {
  worktreePath: string;
}

const keyOf = (port: DevPort) => `${port.pid}:${port.port}`;

/** One pill per port a process started in this worktree listens on; clicking opens it, right-click hides it or ends the process. */
export function DevPortBadges({ worktreePath }: DevPortBadgesProps) {
  const queryClient = useQueryClient();
  const ports = useDevPorts(worktreePath);
  // Keyed by pid as well, so the same port started again by a new process shows up again.
  const [hidden, writeHidden] = useStoredList(HIDDEN_KEY);
  const [menu, setMenu] = useState<{ port: DevPort; at: MenuPoint; confirming: boolean } | null>(null);
  const shown = ports.filter((port) => !hidden.includes(keyOf(port)));
  if (shown.length === 0) return null;

  const close = () => setMenu(null);
  const hide = (port: DevPort) => {
    const live = new Set(ports.map(keyOf));
    writeHidden([...hidden.filter((key) => live.has(key)), keyOf(port)]);
  };
  const stop = async (port: DevPort) => {
    try {
      await postAction({ type: "stop-dev-port", pid: port.pid, port: port.port });
      await queryClient.invalidateQueries({ queryKey: DEV_PORTS_KEY });
    } catch (error) {
      toastError("dev-port-stop", error);
    }
  };

  return (
    <span className="flex shrink-0 items-center gap-1">
      {shown.map((port) => (
        <button
          key={keyOf(port)}
          type="button"
          onClick={() => window.open(`http://localhost:${port.port}`, "_blank", "noopener")}
          onContextMenu={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            setMenu({ port, at: { x: event.clientX, y: event.clientY }, confirming: false });
          }}
          title={`${port.command} (pid ${port.pid})가 ${port.port} 포트에서 듣고 있어요\n누르면 브라우저로 열어요 · 우클릭으로 메뉴`}
          className="flex shrink-0 items-center gap-1 rounded-full bg-bg px-2 py-1 font-mono font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2"
        >
          <span className="size-1.5 rounded-full bg-done" aria-hidden />:{port.port}
        </button>
      ))}
      {/* Portaled so a badge inside the canvas SVG is not clipped; React events still bubble through the portal. */}
      {menu &&
        createPortal(
          <span
            onContextMenu={(event: React.MouseEvent) => event.stopPropagation()}
            onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
          >
            <ContextMenu at={menu.at} label={`:${menu.port.port} 포트 메뉴`} onClose={close}>
              <MenuHeading>
                :{menu.port.port} · {menu.port.command} (pid {menu.port.pid})
              </MenuHeading>
              {menu.confirming ? (
                <>
                  <MenuItem onSelect={close}>취소</MenuItem>
                  <MenuItem
                    tone="danger"
                    onSelect={() => {
                      void stop(menu.port);
                      close();
                    }}
                  >
                    pid {menu.port.pid} 끝내기
                  </MenuItem>
                </>
              ) : (
                <>
                  <MenuItem
                    onSelect={() => {
                      window.open(`http://localhost:${menu.port.port}`, "_blank", "noopener");
                      close();
                    }}
                  >
                    브라우저로 열기
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      void navigator.clipboard.writeText(`http://localhost:${menu.port.port}`);
                      close();
                    }}
                  >
                    주소 복사
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    description="프로세스는 그대로 두고 표시만 지워요"
                    onSelect={() => {
                      hide(menu.port);
                      close();
                    }}
                  >
                    목록에서 지우기
                  </MenuItem>
                  <MenuItem tone="danger" description="이 포트를 연 프로세스를 끝내요" onSelect={() => setMenu({ ...menu, confirming: true })}>
                    서버 끄기
                  </MenuItem>
                </>
              )}
            </ContextMenu>
          </span>,
          document.body,
        )}
    </span>
  );
}
