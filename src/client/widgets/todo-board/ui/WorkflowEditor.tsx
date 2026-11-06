"use client";

import { useState } from "react";
import { columnOfStatus, isFixedStatus } from "@/common/todos/board";
import { TODO_DESCRIPTION_LIMIT } from "@/common/todos/schema";
import type { TodoBoard, TodoStatus } from "@/common/todos/types";
import { statusTone, TONE_DOT } from "../model/kinds";
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
  const [description, setDescription] = useState(status.description);
  const [deleting, setDeleting] = useState(false);
  const fixed = isFixedStatus(board, status.id);
  const others = board.statuses.filter((each) => each.id !== status.id);
  const [picked, setMoveTo] = useState(others[0]?.id ?? "");
  const moveTo = others.some((each) => each.id === picked) ? picked : (others[0]?.id ?? "");
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

  const saveDescription = () => {
    const next = description.trim();
    if (next !== status.description) void onRun({ type: "status-update", statusId: status.id, description: next });
  };

  const toggleNext = (target: string) =>
    void onRun({
      type: "status-update",
      statusId: status.id,
      next: status.next.includes(target) ? status.next.filter((id) => id !== target) : [...status.next, target],
    });

  return (
    <li className="flex flex-col gap-2 border-b border-hair py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${TONE_DOT[statusTone(board, status.id)]}`} />
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
      <input
        aria-label={`${status.name} 설명`}
        value={description}
        maxLength={TODO_DESCRIPTION_LIMIT}
        placeholder="언제 이 상태인지 한 줄로 · 에이전트가 읽어요"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDescription(event.target.value)}
        onBlur={saveDescription}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) saveDescription();
        }}
        className={`${INPUT} ml-4.5`}
      />
      <fieldset className="ml-4.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <legend className="sr-only">{`${status.name}에서 갈 수 있는 상태`}</legend>
        <span className="text-muted">다음 →</span>
        {others.map((target) => (
          <label key={target.id} className="flex items-center gap-1">
            <input type="checkbox" checked={status.next.includes(target.id)} onChange={() => toggleNext(target.id)} />
            {target.name}
          </label>
        ))}
      </fieldset>
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
  const [description, setDescription] = useState("");

  const add = async () => {
    const next = name.trim();
    if (!next) return;
    if ((await onRun({ type: "status-create", name: next, description: description.trim() })) === null) return;
    setName("");
    setDescription("");
  };

  return (
    <Modal label="워크플로 편집" onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-[20px] font-bold">워크플로</h2>
          <p className="mt-1 text-[13px] text-muted">
            처음에서 끝까지 이어지는 흐름이에요. ‘다음 →’은 에이전트가 카드를 옮길 때 따르는 길이고, 손으로는 어디로든 옮길 수 있어요. 에이전트는 끝 상태로 옮기지 않고 제안만 해요. 처음과 끝 상태는 자리를 옮기거나 지울 수 없어요.
          </p>
        </div>
        <button type="button" aria-label="닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>
      <ol className="border-t-2 border-fg">
        {board.statuses.map((status, index) => (
          <StatusRow key={`${status.id}:${status.name}:${status.description}`} board={board} status={status} index={index} onRun={onRun} />
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
        <input
          aria-label="새 상태 설명"
          value={description}
          maxLength={TODO_DESCRIPTION_LIMIT}
          placeholder="언제 이 상태인지 (선택)"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDescription(event.target.value)}
          className={`${INPUT} min-w-56 flex-1`}
        />
        <button type="button" onClick={() => void add()} disabled={!name.trim()} className="rounded-md bg-fg px-3 py-1 text-[13px] font-semibold text-bg disabled:opacity-40">
          상태 추가
        </button>
        <span className="text-[12px] text-muted">끝 상태 바로 앞에, 같은 이름의 새 칸으로 들어가요. 전환은 추가한 뒤 고르세요.</span>
      </div>
    </Modal>
  );
}
