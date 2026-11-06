"use client";

import { useState } from "react";
import { columnOfStatus } from "@/common/todos/board";
import type { TodoBoard, TodoColumn } from "@/common/todos/types";

export interface ColumnMenuActions {
  rename: (columnId: string, name: string) => void;
  setStatuses: (columnId: string, statusIds: string[]) => void;
  setHidden: (columnId: string, hidden: boolean) => void;
  move: (columnId: string, offset: -1 | 1) => void;
  remove: (columnId: string, moveStatusesTo: string | undefined) => void;
}

interface ColumnMenuProps {
  board: TodoBoard;
  column: TodoColumn;
  actions: ColumnMenuActions;
}

const MENU_BUTTON = "rounded-md px-2 py-1 text-left hover:bg-tint disabled:opacity-40 disabled:hover:bg-transparent";

export function ColumnMenu({ board, column, actions }: ColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(column.name);
  const [deleting, setDeleting] = useState(false);
  const others = board.columns.filter((each) => each.id !== column.id);
  const [picked, setMoveTo] = useState(others[0]?.id ?? "");
  const moveTo = others.some((each) => each.id === picked) ? picked : (others[0]?.id ?? "");
  const index = board.columns.findIndex((each) => each.id === column.id);

  const close = () => {
    setOpen(false);
    setDeleting(false);
  };

  const saveName = () => {
    const next = name.trim();
    if (next && next !== column.name) actions.rename(column.id, next);
    else setName(column.name);
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label={`${column.name} 칸 메뉴`}
        onClick={() => {
          setName(column.name);
          setMoveTo(others[0]?.id ?? "");
          setOpen(true);
        }}
        className="rounded-md px-1.5 text-[15px] leading-none text-muted hover:bg-tint-2 hover:text-fg"
      >
        ⋯
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={close} />
      <div
        role="menu"
        aria-label={`${column.name} 칸 메뉴`}
        className="absolute top-full right-0 z-50 mt-1 flex w-64 flex-col gap-3 rounded-[12px] bg-bg p-3 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-muted">이름</span>
          <input
            value={name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) saveName();
            }}
            className="rounded-md bg-tint px-2 py-1 outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
          />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-[11px] font-semibold text-muted">담을 상태</legend>
          {board.statuses.map((status) => {
            const holder = columnOfStatus(board, status.id);
            const mine = holder?.id === column.id;
            return (
              <label key={status.id} className="flex items-center gap-2" title={mine ? "빼려면 다른 칸에서 이 상태를 가져가세요" : undefined}>
                <input
                  type="checkbox"
                  checked={mine}
                  disabled={mine}
                  onChange={() => actions.setStatuses(column.id, [...column.statusIds, status.id])}
                />
                <span>{status.name}</span>
                {!mine && holder && <span className="text-[11px] text-muted">지금 {holder.name}</span>}
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col">
          <button type="button" className={MENU_BUTTON} disabled={index <= 0} onClick={() => actions.move(column.id, -1)}>
            ← 왼쪽으로
          </button>
          <button
            type="button"
            className={MENU_BUTTON}
            disabled={index >= board.columns.length - 1}
            onClick={() => actions.move(column.id, 1)}
          >
            오른쪽으로 →
          </button>
          <button
            type="button"
            className={MENU_BUTTON}
            onClick={() => {
              actions.setHidden(column.id, !column.hidden);
              close();
            }}
          >
            {column.hidden ? "칸 보이기" : "칸 숨기기"}
          </button>
          {!deleting ? (
            <button
              type="button"
              className={`${MENU_BUTTON} text-accent`}
              disabled={column.statusIds.length > 0 && others.length === 0}
              onClick={() => setDeleting(true)}
            >
              칸 지우기
            </button>
          ) : (
            <div className="mt-1 flex flex-col gap-2 rounded-md bg-tint p-2">
              {column.statusIds.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px]">이 칸의 상태 {column.statusIds.length}개를 옮길 칸</span>
                  <select
                    value={moveTo}
                    onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setMoveTo(event.target.value)}
                    className="rounded-md bg-bg px-2 py-1 outline-none"
                  >
                    {others.map((each) => (
                      <option key={each.id} value={each.id}>
                        {each.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" className="text-muted hover:text-fg" onClick={() => setDeleting(false)}>
                  취소
                </button>
                <button
                  type="button"
                  className="font-semibold text-accent"
                  onClick={() => {
                    actions.remove(column.id, column.statusIds.length > 0 ? moveTo : undefined);
                    close();
                  }}
                >
                  지우기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
