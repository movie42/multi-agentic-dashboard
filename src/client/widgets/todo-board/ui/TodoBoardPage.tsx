"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import { archivedCards, boardCards, firstStatusOfColumn, statusOf } from "@/common/todos/board";
import type { TodoBoard, TodoCard, TodoColumn as TodoColumnData } from "@/common/todos/types";
import { sessionListQueryOptions } from "@/client/entities/session";
import { todoBoardQueryOptions, todoJiraStatusQueryOptions, useJiraImport, useTodoOp } from "@/client/entities/todo";
import { useTodoAgentStore } from "@/client/features/talk-to-todo-agent";
import { useDocViewerStore } from "@/client/features/view-doc";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import { errorMessage } from "@/client/shared/model/errorMessage";
import { PendingButton } from "@/client/shared/ui/PendingButton";
import { cardContext, type ModeOf } from "../model/cardContext";
import { NO_PROJECT, statusTone } from "../model/kinds";
import { sessionLookup } from "../model/sessions";
import type { ColumnMenuActions } from "./ColumnMenu";
import { TodoArchive } from "./TodoArchive";
import { TodoCard as TodoCardView } from "./TodoCard";
import { TodoCardDetail } from "./TodoCardDetail";
import { TodoColumn } from "./TodoColumn";
import { WorkflowEditor } from "./WorkflowEditor";

function openTodoAgent(openSessionCount: number) {
  useTodoAgentStore.getState().setSessionCount(openSessionCount);
  useDocViewerStore.getState().openTodoAgent();
}

interface TodoBoardPageProps {
  repos: string[];
  agents: AgentCard[];
  worktrees: WorktreeSummary[];
  now: number;
  modeOf: ModeOf;
  onAction: (action: ActionRequest) => Promise<void>;
  onJumpToAgent: (agent: AgentCard) => void;
}

const PILL = "rounded-full bg-tint px-3.5 py-1.5 text-[13px] leading-none font-semibold text-muted hover:text-fg";

function matchesProject(card: TodoCard, project: string): boolean {
  if (!project) return true;
  if (project === NO_PROJECT) return card.repo === null;
  return card.repo === project;
}

function importNote(result: { added: number; total: number }): string {
  if (result.total === 0) return "최근 2주 안에 움직인, 나에게 할당된 지라 이슈가 없어요";
  return result.added === 0 ? `지라 이슈 ${result.total}개 모두 이미 카드가 있어요` : `지라 이슈로 새 카드 ${result.added}개를 만들었어요`;
}

export function TodoBoardPage({ repos, agents, worktrees, now, modeOf, onAction, onJumpToAgent }: TodoBoardPageProps) {
  const boardQuery = useQuery(todoBoardQueryOptions());
  const jiraQuery = useQuery(todoJiraStatusQueryOptions());
  const { run } = useTodoOp();
  const importJira = useJiraImport();
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [projectKeys, writeProject] = useStoredList("agent-control:todo-project");
  const project = projectKeys[0] ?? "";
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState(false);
  const [showHiddenColumns, setShowHiddenColumns] = useState(false);
  const [columnDraft, setColumnDraft] = useState<string | null>(null);
  const agentPending = useTodoAgentStore((state) => state.pending);

  const board: TodoBoard | undefined = boardQuery.data;
  const liveSessions = new Set(agents.flatMap((agent) => (agent.session ? [agent.session.id] : [])));
  const hasClosedSessions = board?.cards.some((card) => card.sessionIds.some((id) => !liveSessions.has(id))) ?? false;
  const sessionsQuery = useQuery({ ...sessionListQueryOptions(), enabled: hasClosedSessions });
  if (!board) {
    return (
      <header>
        <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">할일</h1>
        <p className="mt-2.5 text-[13px] text-muted">
          {boardQuery.error ? `할일 보드를 읽지 못했어요: ${errorMessage(boardQuery.error)}` : "할일 보드를 읽는 중…"}
        </p>
      </header>
    );
  }

  const sessionOf = sessionLookup(agents, sessionsQuery.data?.sessions ?? []);
  const visible = (card: TodoCard) => matchesProject(card, project);
  const openCard = board.cards.find((card) => card.id === openCardId) ?? null;
  const shownColumns = board.columns.filter((column) => !column.hidden);
  const hiddenColumns = board.columns.filter((column) => column.hidden);
  const filterRepos = [...new Set([...repos, ...board.cards.flatMap((card) => (card.repo ? [card.repo] : []))])].sort((a, b) =>
    a.localeCompare(b),
  );

  const dropCard = (cardId: string, column: TodoColumnData) => {
    const card = board.cards.find((each) => each.id === cardId);
    const target = firstStatusOfColumn(board, column);
    if (!card || !target || column.statusIds.includes(card.statusId)) return;
    void run({ type: "card-move", cardId, statusId: target.id });
  };

  const addCard = (title: string, column: TodoColumnData) => {
    const target = firstStatusOfColumn(board, column);
    if (!target) return;
    const repo = project && project !== NO_PROJECT ? project : null;
    void run({ type: "card-create", title, statusId: target.id, repo });
  };

  const menu: ColumnMenuActions = {
    rename: (columnId, name) => void run({ type: "column-update", columnId, name }),
    setStatuses: (columnId, statusIds) => void run({ type: "column-update", columnId, statusIds }),
    setHidden: (columnId, hidden) => void run({ type: "column-update", columnId, hidden }),
    move: (columnId, offset) => {
      const ids = board.columns.map((column) => column.id);
      const index = ids.indexOf(columnId);
      const [taken] = ids.splice(index, 1);
      if (taken === undefined) return;
      ids.splice(index + offset, 0, taken);
      void run({ type: "column-reorder", columnIds: ids });
    },
    remove: (columnId, moveStatusesTo) => void run({ type: "column-delete", columnId, ...(moveStatusesTo ? { moveStatusesTo } : {}) }),
  };

  const addColumn = () => {
    const name = (columnDraft ?? "").trim();
    if (name) void run({ type: "column-create", name });
    setColumnDraft(null);
  };

  const cardCount = boardCards(board).filter(visible).length;
  const archiveCount = archivedCards(board).length;
  const jiraStatuses = jiraQuery.data ?? {};
  const contextOf = (card: TodoCard) => cardContext(card, worktrees, modeOf);
  const renderCard = (card: TodoCard) => (
    <TodoCardView
      card={card}
      status={statusOf(board, card.statusId)}
      tone={statusTone(board, card.statusId)}
      now={now}
      sessionOf={sessionOf}
      context={contextOf(card)}
      jiraStatuses={jiraStatuses}
      onOpen={setOpenCardId}
    />
  );
  const runImport = async () => {
    const result = await importJira();
    setImportResult(result ? importNote(result) : null);
  };
  const importedAt = board.sync.jiraImportedAt;
  const heldSessions = new Set(board.cards.flatMap((card) => card.sessionIds));
  const openSessionCount = [...liveSessions].filter((id) => !heldSessions.has(id)).length;

  return (
    <>
      <header>
        <h1 className="text-[36px] leading-[1.15] font-bold tracking-[-0.025em]">할일</h1>
        <p className="mt-2.5 text-[13px] text-muted">
          카드 {cardCount} · 상태 {board.statuses.length} · 칸 {board.columns.length}
          {importedAt !== null &&
            ` · 지라 ${new Date(importedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}에 확인`}
          {importResult && ` · ${importResult}`}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            aria-label="프로젝트 거르기"
            value={project}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => writeProject(event.target.value ? [event.target.value] : [])}
            className="rounded-full bg-tint px-3 py-1.5 text-[13px] outline-none"
          >
            <option value="">모든 프로젝트</option>
            <option value={NO_PROJECT}>프로젝트 없음</option>
            {filterRepos.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
          <PendingButton onRun={runImport} pendingLabel="지라 읽는 중" className={PILL}>
            지라 가져오기
          </PendingButton>
          <button type="button" onClick={() => setShowArchive(true)} className={PILL}>
            {`아카이브 ${archiveCount}`}
          </button>
          <button type="button" onClick={() => setEditingWorkflow(true)} className={PILL}>
            워크플로
          </button>
          <button type="button" onClick={() => openTodoAgent(openSessionCount)} className={PILL}>
            할일 에이전트
            {agentPending ? (
              <span className="ml-1.5 text-muted">· 답 기다리는 중</span>
            ) : (
              openSessionCount > 0 && <span className="ml-1.5 text-muted">{`· 새 세션 ${openSessionCount}`}</span>
            )}
          </button>
          {hiddenColumns.length > 0 && (
            <span className="relative">
              <button type="button" aria-expanded={showHiddenColumns} onClick={() => setShowHiddenColumns((current) => !current)} className={PILL}>
                숨긴 칸 {hiddenColumns.length}
              </button>
              {showHiddenColumns && (
                <ul className="absolute top-full left-0 z-30 mt-1 flex w-56 flex-col rounded-[12px] bg-bg p-2 text-[13px] shadow-[0_16px_40px_-12px_var(--faint),inset_0_0_0_1px_var(--hair)]">
                  {hiddenColumns.map((column) => (
                    <li key={column.id} className="flex items-center gap-2 px-2 py-1">
                      <span className="flex-1 truncate">{column.name}</span>
                      <button
                        type="button"
                        onClick={() => void run({ type: "column-update", columnId: column.id, hidden: false })}
                        className="text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
                      >
                        보이기
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          )}
        </div>
      </header>

      <div className="-mx-5 -mb-36 flex min-h-[calc(100dvh-15.5rem)] gap-3 overflow-x-auto px-5 pb-6 md:-mx-12 md:px-12">
        {shownColumns.map((column) => (
          <TodoColumn
            key={column.id}
            board={board}
            column={column}
            visible={visible}
            renderCard={renderCard}
            onDropCard={dropCard}
            onAddCard={addCard}
            menu={menu}
          />
        ))}
        {columnDraft === null ? (
          <button type="button" onClick={() => setColumnDraft("")} className="w-40 shrink-0 self-start rounded-[12px] px-3 py-2.5 text-left text-[13px] text-muted hover:bg-tint hover:text-fg">
            + 칸 추가
          </button>
        ) : (
          <input
            autoFocus
            aria-label="새 칸 이름"
            placeholder="칸 이름"
            value={columnDraft}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setColumnDraft(event.target.value)}
            onBlur={(event: React.FocusEvent<HTMLInputElement>) => {
              if (!event.currentTarget.dataset.cancelled) addColumn();
            }}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) addColumn();
              if (event.key === "Escape") {
                event.currentTarget.dataset.cancelled = "true";
                setColumnDraft(null);
              }
            }}
            className="w-56 shrink-0 self-start rounded-[12px] bg-tint px-3 py-2.5 text-[13px] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
          />
        )}
      </div>

      {openCard && (
        <TodoCardDetail
          key={openCard.id}
          board={board}
          card={openCard}
          repos={filterRepos}
          worktrees={worktrees}
          sessionOf={sessionOf}
          context={contextOf(openCard)}
          jiraStatuses={jiraStatuses}
          onRun={run}
          onAction={onAction}
          onJumpToAgent={onJumpToAgent}
          onClose={() => setOpenCardId(null)}
        />
      )}
      {showArchive && (
        <TodoArchive
          board={board}
          onOpen={(cardId) => {
            setShowArchive(false);
            setOpenCardId(cardId);
          }}
          onRun={run}
          onClose={() => setShowArchive(false)}
        />
      )}
      {editingWorkflow && <WorkflowEditor board={board} onRun={run} onClose={() => setEditingWorkflow(false)} />}
    </>
  );
}
