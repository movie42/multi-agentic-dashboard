import type { StatusKind, TodoBoard, TodoCard, TodoColumn, TodoStatus } from "./types";

export class TodoRuleError extends Error {}

function fail(message: string): never {
  throw new TodoRuleError(message);
}

export function defaultBoard(): TodoBoard {
  const statuses: TodoStatus[] = [
    { id: "st-todo", name: "할일", kind: "standby" },
    { id: "st-progress", name: "진행 중", kind: "progress" },
    { id: "st-review", name: "리뷰", kind: "review" },
    { id: "st-done", name: "끝", kind: "done" },
  ];
  return {
    version: 1,
    statuses,
    columns: statuses.map((status) => ({
      id: `col-${status.id.slice(3)}`,
      name: status.name,
      statusIds: [status.id],
      hidden: status.kind === "review",
    })),
    cards: [],
  };
}

export function statusOf(board: TodoBoard, statusId: string): TodoStatus | undefined {
  return board.statuses.find((status) => status.id === statusId);
}

export function statusIndex(board: TodoBoard, statusId: string): number {
  return board.statuses.findIndex((status) => status.id === statusId);
}

export function isFixedStatus(board: TodoBoard, statusId: string): boolean {
  return board.statuses[0]?.id === statusId || board.statuses.at(-1)?.id === statusId;
}

export function columnOfStatus(board: TodoBoard, statusId: string): TodoColumn | undefined {
  return board.columns.find((column) => column.statusIds.includes(statusId));
}

export function firstStatusOfColumn(board: TodoBoard, column: TodoColumn): TodoStatus | undefined {
  return board.statuses.find((status) => column.statusIds.includes(status.id));
}

export function cardsOfColumn(board: TodoBoard, column: TodoColumn): TodoCard[] {
  return board.cards.filter((card) => column.statusIds.includes(card.statusId));
}

function requireCard(board: TodoBoard, cardId: string): TodoCard {
  return board.cards.find((card) => card.id === cardId) ?? fail("카드를 찾을 수 없어요");
}

function requireStatus(board: TodoBoard, statusId: string): TodoStatus {
  return statusOf(board, statusId) ?? fail("상태를 찾을 수 없어요");
}

function requireColumn(board: TodoBoard, columnId: string): TodoColumn {
  return board.columns.find((column) => column.id === columnId) ?? fail("칸을 찾을 수 없어요");
}

function inWorkflowOrder(board: TodoBoard, statusIds: readonly string[]): string[] {
  return board.statuses.filter((status) => statusIds.includes(status.id)).map((status) => status.id);
}

export function updateCard(board: TodoBoard, cardId: string, patch: Partial<TodoCard>, now: number): TodoBoard {
  requireCard(board, cardId);
  return {
    ...board,
    cards: board.cards.map((card) => (card.id === cardId ? { ...card, ...patch, id: card.id, updatedAt: now } : card)),
  };
}

export function moveCard(board: TodoBoard, cardId: string, statusId: string, now: number, auto = false): TodoBoard {
  const card = requireCard(board, cardId);
  requireStatus(board, statusId);
  const moved: TodoCard = { ...card, statusId, autoMovedAt: auto ? now : null, updatedAt: now };
  return { ...board, cards: [...board.cards.filter((each) => each.id !== cardId), moved] };
}

export function createStatus(
  board: TodoBoard,
  input: { id: string; name: string; kind: StatusKind; columnId?: string },
): TodoBoard {
  const last = board.statuses.at(-1) ?? fail("상태 목록이 비어 있어요");
  const status: TodoStatus = { id: input.id, name: input.name, kind: input.kind };
  const statuses = [...board.statuses.slice(0, -1), status, last];
  if (input.columnId) {
    requireColumn(board, input.columnId);
    const columns = board.columns.map((column) =>
      column.id === input.columnId ? { ...column, statusIds: [...column.statusIds, status.id] } : column,
    );
    return normalizeColumns({ ...board, statuses, columns });
  }
  const lastColumnIndex = board.columns.findIndex((column) => column.statusIds.includes(last.id));
  const column: TodoColumn = { id: `col-${input.id}`, name: input.name, statusIds: [status.id], hidden: false };
  const at = lastColumnIndex < 0 ? board.columns.length : lastColumnIndex;
  return { ...board, statuses, columns: [...board.columns.slice(0, at), column, ...board.columns.slice(at)] };
}

export function updateStatus(board: TodoBoard, statusId: string, patch: { name?: string; kind?: StatusKind }): TodoBoard {
  requireStatus(board, statusId);
  return {
    ...board,
    statuses: board.statuses.map((status) => (status.id === statusId ? { ...status, ...patch } : status)),
  };
}

export function deleteStatus(board: TodoBoard, statusId: string, moveTo: string | undefined, now: number): TodoBoard {
  requireStatus(board, statusId);
  if (isFixedStatus(board, statusId)) fail("처음과 끝 상태는 지울 수 없어요");
  const cards = board.cards.filter((card) => card.statusId === statusId);
  if (cards.length > 0) {
    if (!moveTo) fail(`카드 ${cards.length}개를 옮길 상태를 골라 주세요`);
    if (moveTo === statusId) fail("지우는 상태로는 옮길 수 없어요");
    requireStatus(board, moveTo);
  }
  return {
    ...board,
    statuses: board.statuses.filter((status) => status.id !== statusId),
    columns: board.columns.map((column) => ({ ...column, statusIds: column.statusIds.filter((id) => id !== statusId) })),
    cards: board.cards.map((card) =>
      card.statusId === statusId && moveTo ? { ...card, statusId: moveTo, autoMovedAt: null, updatedAt: now } : card,
    ),
  };
}

export function reorderStatuses(board: TodoBoard, statusIds: readonly string[]): TodoBoard {
  const current = board.statuses.map((status) => status.id);
  if (statusIds.length !== current.length || current.some((id) => !statusIds.includes(id))) {
    fail("상태 목록이 맞지 않아요");
  }
  if (statusIds[0] !== current[0] || statusIds.at(-1) !== current.at(-1)) fail("처음과 끝 상태는 자리를 옮길 수 없어요");
  return normalizeColumns({ ...board, statuses: statusIds.map((id) => requireStatus(board, id)) });
}

export function createColumn(board: TodoBoard, input: { id: string; name: string }): TodoBoard {
  return { ...board, columns: [...board.columns, { id: input.id, name: input.name, statusIds: [], hidden: false }] };
}

export function updateColumn(board: TodoBoard, columnId: string, patch: { name?: string; hidden?: boolean }): TodoBoard {
  requireColumn(board, columnId);
  return { ...board, columns: board.columns.map((column) => (column.id === columnId ? { ...column, ...patch } : column)) };
}

/** A status lives in exactly one column, so a status can only leave a column by joining another one. */
export function setColumnStatuses(board: TodoBoard, columnId: string, statusIds: readonly string[]): TodoBoard {
  const target = requireColumn(board, columnId);
  statusIds.forEach((id) => requireStatus(board, id));
  if (target.statusIds.some((id) => !statusIds.includes(id))) fail("상태를 빼려면 다른 칸에서 그 상태를 가져가세요");
  const columns = board.columns.map((column) =>
    column.id === columnId
      ? { ...column, statusIds: [...statusIds] }
      : { ...column, statusIds: column.statusIds.filter((id) => !statusIds.includes(id)) },
  );
  return normalizeColumns({ ...board, columns });
}

export function deleteColumn(board: TodoBoard, columnId: string, moveStatusesTo: string | undefined): TodoBoard {
  const column = requireColumn(board, columnId);
  if (column.statusIds.length > 0) {
    if (!moveStatusesTo) fail("이 칸의 상태를 옮길 칸을 골라 주세요");
    if (moveStatusesTo === columnId) fail("지우는 칸으로는 옮길 수 없어요");
    requireColumn(board, moveStatusesTo);
  }
  const columns = board.columns
    .filter((each) => each.id !== columnId)
    .map((each) => (each.id === moveStatusesTo ? { ...each, statusIds: [...each.statusIds, ...column.statusIds] } : each));
  return normalizeColumns({ ...board, columns });
}

export function reorderColumns(board: TodoBoard, columnIds: readonly string[]): TodoBoard {
  const current = board.columns.map((column) => column.id);
  if (columnIds.length !== current.length || current.some((id) => !columnIds.includes(id))) fail("칸 목록이 맞지 않아요");
  return { ...board, columns: columnIds.map((id) => requireColumn(board, id)) };
}

function normalizeColumns(board: TodoBoard): TodoBoard {
  return { ...board, columns: board.columns.map((column) => ({ ...column, statusIds: inWorkflowOrder(board, column.statusIds) })) };
}
