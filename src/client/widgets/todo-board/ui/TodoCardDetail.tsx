"use client";

import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/orca/types";
import { columnOfStatus } from "@/common/todos/board";
import { parseJiraUrl } from "@/common/todos/jira";
import type { TodoOp } from "@/common/todos/ops";
import { TODO_TITLE_LIMIT } from "@/common/todos/schema";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import { StateBadge } from "@/client/entities/agent";
import type { RunTodoOp } from "../model/run";
import type { SessionLookup, TodoSessionView } from "../model/sessions";
import { MemoEditor } from "./MemoEditor";
import { Modal } from "./Modal";
import { PendingButton } from "@/client/shared/ui/PendingButton";

interface TodoCardDetailProps {
  board: TodoBoard;
  card: TodoCard;
  repos: string[];
  worktrees: WorktreeSummary[];
  sessionOf: SessionLookup;
  onRun: RunTodoOp;
  onAction: (action: ActionRequest) => Promise<void>;
  onJumpToAgent: (agent: AgentCard) => void;
  onClose: () => void;
}

const FIELD_LABEL = "text-[11px] font-semibold text-muted";
const SELECT = "rounded-md bg-tint px-2 py-1.5 text-[13px] outline-none";

function resumeAction(session: TodoSessionView): ActionRequest | null {
  const { summary } = session;
  if (summary?.cwd && summary.cwdExists) return { type: "resume-session", sessionId: session.id, cwd: summary.cwd, title: summary.title };
  return null;
}

export function TodoCardDetail({ board, card, repos, worktrees, sessionOf, onRun, onAction, onJumpToAgent, onClose }: TodoCardDetailProps) {
  const [title, setTitle] = useState(card.title);
  const [jiraDraft, setJiraDraft] = useState("");
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (patch: Omit<Extract<TodoOp, { type: "card-update" }>, "type" | "cardId">) =>
    onRun({ type: "card-update", cardId: card.id, ...patch });

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== card.title) void update({ title: next });
    else setTitle(card.title);
  };

  const addJira = () => {
    const parsed = parseJiraUrl(jiraDraft);
    if (!parsed) {
      setJiraError("지라 이슈 주소를 붙여 넣어 주세요 (…/browse/ABC-123)");
      return;
    }
    setJiraError(null);
    setJiraDraft("");
    void update({ jiraUrls: [...card.jira.map((jira) => jira.url), parsed.url] });
  };

  const worktreeChoices = worktrees.filter((worktree) => !card.repo || worktree.repo === card.repo);
  const sessions = card.sessionIds.map(sessionOf);
  const lastStatus = board.statuses.at(-1);

  const launch = async () => {
    if (!card.worktreePath) return;
    if ((await onRun({ type: "card-launch", cardId: card.id })) === null) return;
    await onAction({ type: "launch-agent", worktreePath: card.worktreePath, prompt: "" });
  };

  return (
    <Modal label={`카드 ${card.title}`} onClose={onClose}>
      <div className="flex items-start gap-3">
        <input
          aria-label="카드 제목"
          value={title}
          maxLength={TODO_TITLE_LIMIT}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
          }}
          className="min-w-0 flex-1 rounded-md px-1 text-[22px] leading-[1.3] font-bold tracking-[-0.015em] outline-none focus:bg-tint"
        />
        <button type="button" aria-label="닫기" onClick={onClose} className="text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>

      {card.doneSuggestedAt !== null && lastStatus && card.statusId !== lastStatus.id && (
        <div className="flex items-center gap-3 rounded-[10px] bg-done/10 px-4 py-2.5 text-[13px]">
          <span className="flex-1">에이전트가 끝으로 옮겨도 될 것 같다고 했어요.</span>
          <button
            type="button"
            onClick={() => void onRun({ type: "card-move", cardId: card.id, statusId: lastStatus.id })}
            className="rounded-md bg-done px-3 py-1 font-semibold text-st-ink"
          >
            {`${lastStatus.name} 상태로 옮기기`}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>상태</span>
          <select
            value={card.statusId}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              void onRun({ type: "card-move", cardId: card.id, statusId: event.target.value })
            }
            className={SELECT}
          >
            {board.statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
                {` · ${columnOfStatus(board, status.id)?.name ?? "칸 없음"}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>프로젝트</span>
          <select
            value={card.repo ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const repo = event.target.value || null;
              const keepWorktree = worktrees.some((worktree) => worktree.path === card.worktreePath && worktree.repo === repo);
              void update({ repo, ...(keepWorktree ? {} : { worktreePath: null }) });
            }}
            className={SELECT}
          >
            <option value="">프로젝트 없음</option>
            {[...new Set([...repos, ...(card.repo ? [card.repo] : [])])].map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>워크트리</span>
          <select
            value={card.worktreePath ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const worktree = worktrees.find((each) => each.path === event.target.value);
              void update(worktree ? { worktreePath: worktree.path, repo: worktree.repo } : { worktreePath: null });
            }}
            className={SELECT}
          >
            <option value="">워크트리 없음</option>
            {card.worktreePath && !worktreeChoices.some((worktree) => worktree.path === card.worktreePath) && (
              <option value={card.worktreePath}>{card.worktreePath}</option>
            )}
            {worktreeChoices.map((worktree) => (
              <option key={worktree.path} value={worktree.path}>
                {card.repo ? worktree.name : `${worktree.repo} · ${worktree.name}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>메모</span>
        <MemoEditor memo={card.memo} onSave={(memo) => void update({ memo })} />
      </section>

      <section className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>지라</span>
        <div className="flex flex-wrap items-center gap-2">
          {card.jira.map((jira) => (
            <span key={jira.key} className="flex items-center gap-1 rounded-full bg-tint-2 py-1 pr-1.5 pl-2.5 text-[12px] font-semibold">
              <a href={jira.url} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                {jira.key}
              </a>
              <button
                type="button"
                aria-label={`${jira.key} 떼기`}
                onClick={() => void update({ jiraUrls: card.jira.filter((each) => each.key !== jira.key).map((each) => each.url) })}
                className="px-1 text-muted hover:text-fg"
              >
                ×
              </button>
            </span>
          ))}
          <input
            aria-label="지라 이슈 URL"
            value={jiraDraft}
            placeholder="지라 이슈 URL 붙여넣기"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setJiraDraft(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && jiraDraft.trim()) addJira();
            }}
            className="min-w-56 flex-1 rounded-full bg-tint px-3 py-1.5 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
          />
        </div>
        {jiraError && <p className="text-[12px] text-accent">{jiraError}</p>}
      </section>

      <section className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>세션</span>
        {sessions.length === 0 && (
          <p className="text-[13px] text-muted">붙은 세션이 없어요. 에이전트 카드나 지난 세션에서 ‘할일에 붙이기’를 누르세요.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {sessions.map((session) => {
            const { agent } = session;
            const resume = agent ? null : resumeAction(session);
            return (
              <li key={session.id} className="flex items-center gap-2 text-[13px]">
                {session.agent ? <StateBadge agent={session.agent} /> : <span className="text-[11px] text-muted">닫힘</span>}
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
                {agent ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onJumpToAgent(agent);
                    }}
                    className="text-muted underline decoration-faint underline-offset-[3px] hover:text-fg"
                  >
                    에이전트로 이동
                  </button>
                ) : (
                  <PendingButton
                    disabled={!resume}
                    title={resume ? undefined : "세션 폴더가 없어 다시 열 수 없어요"}
                    onRun={async () => {
                      if (resume) await onAction(resume);
                    }}
                    pendingLabel="여는 중"
                    className="text-muted underline decoration-faint underline-offset-[3px] hover:text-fg disabled:no-underline disabled:opacity-40"
                  >
                    Orca에서 다시 열기
                  </PendingButton>
                )}
                <button
                  type="button"
                  onClick={() => void onRun({ type: "session-detach", cardId: card.id, sessionId: session.id })}
                  className="text-muted hover:text-fg"
                >
                  떼기
                </button>
              </li>
            );
          })}
        </ul>
        {card.worktreePath && (
          <PendingButton
            onRun={launch}
            disabled={card.pendingLaunch !== null}
            pendingLabel="여는 중"
            className="mt-1 self-start rounded-full bg-fg px-3.5 py-1.5 text-[13px] leading-none font-semibold text-bg hover:opacity-85 disabled:opacity-40"
          >
            {card.pendingLaunch ? "새 세션을 찾는 중…" : "새 세션"}
          </PendingButton>
        )}
      </section>

      <footer className="flex items-center gap-4 border-t border-hair pt-4 text-[13px]">
        <button
          type="button"
          onClick={() => void onRun({ type: "card-hide", cardId: card.id, hidden: !card.hidden })}
          className="text-muted hover:text-fg"
        >
          {card.hidden ? "다시 보이기" : "숨기기"}
        </button>
        <span className="ml-auto flex items-center gap-3">
          {confirmDelete ? (
            <>
              <span className="text-muted">카드를 지울까요? 붙은 세션은 그대로 남아요.</span>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted hover:text-fg">
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  void onRun({ type: "card-delete", cardId: card.id });
                  onClose();
                }}
                className="font-semibold text-accent"
              >
                지우기
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-accent hover:underline">
              삭제
            </button>
          )}
        </span>
      </footer>
    </Modal>
  );
}
