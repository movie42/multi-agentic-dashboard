"use client";

import { useState } from "react";
import { columnOfStatus, isFixedStatus } from "@/common/todos/board";
import { STATUS_KINDS, type StatusKind, type TodoBoard, type TodoStatus } from "@/common/todos/types";
import { KIND_DOT, KIND_LABEL } from "../model/kinds";
import type { RunTodoOp } from "../model/run";
import { Modal } from "./Modal";

interface WorkflowEditorProps {
  board: TodoBoard;
  onRun: RunTodoOp;
  onClose: () => void;
}

const INPUT = "rounded-md bg-tint px-2 py-1 text-[13px] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]";

interface StatusRowProps {
  board: TodoBoard;
  status: TodoStatus;
  index: number;
  onRun: RunTodoOp;
}

function StatusRow({ board, status, index, onRun }: StatusRowProps) {
  const [name, setName] = useState(status.name);
  const [deleting, setDeleting] = useState(false);
  const fixed = isFixedStatus(board, status.id);
  const others = board.statuses.filter((each) => each.id !== status.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  const cardCount = board.cards.filter((card) => card.statusId === status.id).length;
  const ids = board.statuses.map((each) => each.id);
  const canMove = (offset: -1 | 1) => !fixed && !isFixedStatus(board, ids[index + offset] ?? "") && ids[index + offset] !== undefined;

  const move = (offset: -1 | 1) => {
    const next = [...ids];
    const [taken] = next.splice(index, 1);
    if (taken === undefined) return;
    next.splice(index + offset, 0, taken);
    void onRun({ type: "status-reorder", statusIds: next });
  };

  const saveName = () => {
    const next = name.trim();
    if (next && next !== status.name) void onRun({ type: "status-update", statusId: status.id, name: next });
    else setName(status.name);
  };

  return (
    <li className="flex flex-col gap-2 border-b border-hair py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${KIND_DOT[status.kind]}`} />
        <input
          aria-label={`${status.name} 이름`}
          value={name}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) saveName();
          }}
          className={`${INPUT} w-36`}
        />
        <select
          aria-label={`${status.name} 종류`}
          value={status.kind}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            const kind = STATUS_KINDS.find((each) => each === event.target.value);
            if (kind) void onRun({ type: "status-update", statusId: status.id, kind });
          }}
          className={INPUT}
        >
          {STATUS_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-muted">
          {columnOfStatus(board, status.id)?.name ?? "칸 없음"} 칸 · 카드 {cardCount}
          {fixed && (index === 0 ? " · 처음" : " · 끝")}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[13px]">
          <button type="button" aria-label={`${status.name} 위로`} disabled={!canMove(-1)} onClick={() => move(-1)} className="px-1.5 text-muted hover:text-fg disabled:opacity-30">
            ↑
          </button>
          <button type="button" aria-label={`${status.name} 아래로`} disabled={!canMove(1)} onClick={() => move(1)} className="px-1.5 text-muted hover:text-fg disabled:opacity-30">
            ↓
          </button>
          {!fixed && (
            <button type="button" onClick={() => setDeleting(true)} className="ml-2 text-accent hover:underline">
              지우기
            </button>
          )}
        </span>
      </div>
      {deleting && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-tint p-2 text-[13px]">
          {cardCount > 0 ? (
            <label className="flex items-center gap-2">
              카드 {cardCount}개를 어느 상태로 옮길까요?
              <select value={moveTo} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setMoveTo(event.target.value)} className="rounded-md bg-bg px-2 py-1 outline-none">
                {others.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>이 상태를 지울까요?</span>
          )}
          <span className="ml-auto flex gap-3">
            <button type="button" onClick={() => setDeleting(false)} className="text-muted hover:text-fg">
              취소
            </button>
            <button
              type="button"
              onClick={() => void onRun({ type: "status-delete", statusId: status.id, ...(cardCount > 0 ? { moveTo } : {}) })}
              className="font-semibold text-accent"
            >
              {cardCount > 0 ? "옮기고 지우기" : "지우기"}
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

export function WorkflowEditor({ board, onRun, onClose }: WorkflowEditorProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<StatusKind>("progress");

  const add = async () => {
    const next = name.trim();
    if (!next) return;
    if ((await onRun({ type: "status-create", name: next, kind })) !== null) setName("");
  };

  return (
    <Modal label="워크플로 편집" onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-[20px] font-bold">워크플로</h2>
          <p className="mt-1 text-[13px] text-muted">
            상태의 순서가 곧 일의 흐름이에요. 자동 이동은 상태의 종류를 보고 앞으로만 옮겨요. 처음과 끝 상태는 자리를 옮기거나 지울 수 없어요.
          </p>
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>
      <ol className="border-t-2 border-fg">
        {board.statuses.map((status, index) => (
          <StatusRow key={`${status.id}:${status.name}`} board={board} status={status} index={index} onRun={onRun} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="새 상태 이름"
          value={name}
          placeholder="새 상태 이름"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void add();
          }}
          className={`${INPUT} w-40`}
        />
        <select
          aria-label="새 상태 종류"
          value={kind}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setKind(STATUS_KINDS.find((each) => each === event.target.value) ?? "progress")}
          className={INPUT}
        >
          {STATUS_KINDS.map((each) => (
            <option key={each} value={each}>
              {KIND_LABEL[each]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void add()} disabled={!name.trim()} className="rounded-md bg-fg px-3 py-1 text-[13px] font-semibold text-bg disabled:opacity-40">
          상태 추가
        </button>
        <span className="text-[12px] text-muted">끝 상태 바로 앞에, 같은 이름의 새 칸으로 들어가요.</span>
      </div>
    </Modal>
  );
}
