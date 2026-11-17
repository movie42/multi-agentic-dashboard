"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TerminalKey } from "@/common/actions/schema";
import { terminalScreenKey, useTerminalScreen } from "@/client/entities/runner";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { terminalMenu } from "@/common/terminal/menu";
import { keysToPick } from "../lib/terminalMenu";

const KEY_BUTTONS: { key: TerminalKey; label: string; title: string }[] = [
  { key: "up", label: "↑", title: "위로" },
  { key: "down", label: "↓", title: "아래로" },
  { key: "enter", label: "Enter", title: "고른 것으로 확인" },
  { key: "escape", label: "Esc", title: "취소" },
];

const OPTION =
  "cursor-pointer rounded-full px-3 py-1 text-[13px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint disabled:cursor-default disabled:opacity-30";
const KEY =
  "cursor-pointer rounded-md px-2 py-0.5 font-mono text-[12px] leading-5 text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg disabled:cursor-default disabled:opacity-30";

interface TerminalMenuControlsProps {
  terminalHandle: string;
}

/**
 * Answers a choice Claude Code draws only in the terminal without opening it: one button per option
 * it finds on the screen, plus the raw keys for anything it cannot read.
 */
export function TerminalMenuControls({ terminalHandle }: TerminalMenuControlsProps) {
  const queryClient = useQueryClient();
  const menu = terminalMenu(useTerminalScreen(terminalHandle));
  const [pressing, setPressing] = useState(false);

  const press = async (keys: TerminalKey[]) => {
    if (pressing) return;
    setPressing(true);
    try {
      await postAction({ type: "press-keys", terminalHandle, keys });
      await queryClient.invalidateQueries({ queryKey: terminalScreenKey(terminalHandle) });
    } catch (error) {
      toastError("terminal-menu", error);
    } finally {
      setPressing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {menu?.options.map((option, index) => (
        <button
          key={option}
          type="button"
          data-menu-option
          disabled={pressing}
          onClick={() => void press(keysToPick(menu, index))}
          className={`${OPTION} ${index === menu.cursor ? "bg-bg text-fg" : "text-muted"}`}
        >
          {option}
        </button>
      ))}
      <span className={`flex items-center gap-1 ${menu ? "ml-auto" : ""}`}>
        {KEY_BUTTONS.map((entry) => (
          <button key={entry.key} type="button" title={entry.title} disabled={pressing} onClick={() => void press([entry.key])} className={KEY}>
            {entry.label}
          </button>
        ))}
      </span>
    </div>
  );
}
