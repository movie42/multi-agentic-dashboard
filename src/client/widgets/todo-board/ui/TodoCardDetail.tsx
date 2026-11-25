"use client";

import { useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import { columnOfStatus } from "@/common/todos/board";
import { LINK_LABEL, linkCaption, parseCardLink } from "@/common/todos/links";
import type { TodoOp } from "@/common/todos/ops";
import { TODO_TITLE_LIMIT } from "@/common/todos/schema";
import type { TodoBoard, TodoCard, TodoJiraStatuses } from "@/common/todos/types";
import { StateBadge } from "@/client/entities/agent";
import { ACTION_ICONS } from "@/client/shared/ui/ActionIcons";
import { type CardContext, pullRequestLabel } from "../model/cardContext";
import type { RunTodoOp } from "../model/run";
import type { SessionLookup, TodoSessionView } from "../model/sessions";
import { MemoEditor } from "./MemoEditor";
import { Modal } from "@/client/shared/ui/Modal";
import { PendingButton } from "@/client/shared/ui/PendingButton";

interface TodoCardDetailProps {
  board: TodoBoard;
  card: TodoCard;
  repos: string[];
  worktrees: WorktreeSummary[];
  sessionOf: SessionLookup;
  context: CardContext;
  jiraStatuses: TodoJiraStatuses;
  onRun: RunTodoOp;
  onAction: (action: ActionRequest) => Promise<void>;
  onJumpToAgent: (agent: AgentCard) => void;
  onClose: () => void;
}

const FIELD_LABEL = "text-[11px] font-semibold text-muted";
const SELECT = "rounded-md bg-tint px-2 py-1.5 text-[13px] outline-none";
const CHIP = "flex items-center gap-1 rounded-full bg-tint-2 py-1 pr-1.5 pl-2.5 text-[12px] font-semibold";
const QUIET_LINK = "text-muted underline decoration-faint underline-offset-[3px] hover:text-fg";
const PAST_PREVIEW = 5;

function resumeAction(session: TodoSessionView): ActionRequest | null {
  const { summary } = session;
  if (summary?.cwd && summary.cwdExists) return { type: "resume-session", sessionId: session.id, cwd: summary.cwd, title: summary.title };
  return null;
}

export function TodoCardDetail({
  board,
  card,
  repos,
  worktrees,
  sessionOf,
  context,
  jiraStatuses,
  onRun,
  onAction,
  onJumpToAgent,
  onClose,
}: TodoCardDetailProps) {
  const [title, setTitle] = useState(card.title);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showAllPast, setShowAllPast] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (patch: Omit<Extract<TodoOp, { type: "card-update" }>, "type" | "cardId">) =>
    onRun({ type: "card-update", cardId: card.id, ...patch });

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== card.title) void update({ title: next });
    else setTitle(card.title);
  };

  const addLink = () => {
    const parsed = parseCardLink(linkDraft);
    if (!parsed) {
      setLinkError("주소를 붙여 넣어 주세요 (https://…)");
      return;
    }
    setLinkError(null);
    setLinkDraft("");
    if (parsed.type === "jira") void update({ jiraUrls: [...card.jira.map((jira) => jira.url), parsed.jira.url] });
    else void update({ linkUrls: [...card.links.map((link) => link.url), parsed.link.url] });
  };

  const worktreeChoices = worktrees.filter((worktree) => !card.repo || worktree.repo === card.repo);
  const sessions = card.sessionIds.map(sessionOf);
  const openSessions = sessions.filter((session) => session.agent !== null);
  const pastSessions = sessions
    .filter((session) => session.agent === null)
    .sort((a, b) => (b.summary?.updatedAt ?? 0) - (a.summary?.updatedAt ?? 0));
  const shownPast = showAllPast ? pastSessions : pastSessions.slice(0, PAST_PREVIEW);
  const lastStatus = board.statuses.at(-1);
  const { pullRequest, flowTasks } = context;

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

      {card.archivedAt !== null && (
        <div className="flex items-center gap-3 rounded-[10px] bg-tint px-4 py-2.5 text-[13px]">
          <span className="flex-1">{`아카이브된 카드예요 · ${new Date(card.archivedAt).toLocaleDateString("ko-KR")}`}</span>
          <button
            type="button"
            onClick={() => void onRun({ type: "card-restore", cardId: card.id })}
            className="rounded-md bg-fg px-3 py-1 font-semibold text-bg"
          >
            보드로 되돌리기
          </button>
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <div className="flex flex-col gap-1">
          <label htmlFor={`start-${card.id}`} className={FIELD_LABEL}>
            시작일
          </label>
          <span className="flex items-center gap-2">
            <input
              id={`start-${card.id}`}
              type="date"
              value={card.startDate ?? ""}
              max={card.dueDate ?? undefined}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => void update({ startDate: event.target.value || null })}
              className={`${SELECT} min-w-0 flex-1`}
            />
            {card.startDate && (
              <button type="button" onClick={() => void update({ startDate: null })} className={QUIET_LINK}>
                지우기
              </button>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`due-${card.id}`} className={FIELD_LABEL}>
            마감일
          </label>
          <span className="flex items-center gap-2">
            <input
              id={`due-${card.id}`}
              type="date"
              value={card.dueDate ?? ""}
              min={card.startDate ?? undefined}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                void update(event.target.value ? { dueDate: event.target.value } : { dueDate: null, startDate: null })
              }
              className={`${SELECT} min-w-0 flex-1`}
            />
            {card.dueDate && (
              <button type="button" onClick={() => void update({ dueDate: null, startDate: null })} className={QUIET_LINK}>
                백로그로
              </button>
            )}
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>메모</span>
        <MemoEditor memo={card.memo} onSave={(memo) => void update({ memo })} />
      </section>

      <section className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>지라 · 링크</span>
        <div className="flex flex-wrap items-center gap-2">
          {card.jira.map((jira) => (
            <span key={jira.key} className={CHIP}>
              <a href={jira.url} target="_blank" rel="noreferrer" className="hover:underline">
                <span className="font-mono">{jira.key}</span>
                {jiraStatuses[jira.key] && <span className="ml-1 font-normal text-muted">{jiraStatuses[jira.key]}</span>}
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
          {card.links.map((link) => (
            <span key={link.url} className={CHIP}>
              <a href={link.url} target="_blank" rel="noreferrer" className="hover:underline" title={link.url}>
                <span className="text-muted">{LINK_LABEL[link.kind]}</span> {linkCaption(link)}
              </a>
              <button
                type="button"
                aria-label={`${linkCaption(link)} 떼기`}
                onClick={() => void update({ linkUrls: card.links.filter((each) => each.url !== link.url).map((each) => each.url) })}
                className="px-1 text-muted hover:text-fg"
              >
                ×
              </button>
            </span>
          ))}
          <input
            aria-label="지라 · 링크 주소"
            value={linkDraft}
            placeholder="지라 · 슬랙 · 노션 · 피그마 · PR 주소 붙여넣기"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLinkDraft(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing && linkDraft.trim()) addLink();
            }}
            className="min-w-56 flex-1 rounded-full bg-tint px-3 py-1.5 text-[13px] outline-none placeholder:text-muted focus:shadow-[inset_0_0_0_1.5px_var(--faint)]"
          />
        </div>
        {linkError && <p className="text-[12px] text-accent">{linkError}</p>}
      </section>

      {(flowTasks.length > 0 || pullRequest) && (
        <section className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>작업 문서 · PR</span>
          <ul className="flex flex-col gap-1.5">
            {flowTasks.map(({ task, step }) => (
              <li key={`${task.domain}/${task.taskId}`} className="flex items-center gap-2 text-[13px]">
                <span className="text-[11px] font-semibold text-muted">flow</span>
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <span className="shrink-0 text-[12px] text-muted">{step ?? "완료"}</span>
                {task.pageIndex && (
                  <button
                    type="button"
                    onClick={() => task.pageIndex && void onAction({ type: "open-artifact", target: task.pageIndex })}
                    className={`flex shrink-0 items-center gap-1 ${QUIET_LINK}`}
                  >
                    {ACTION_ICONS.doc}
                    문서 열기
                  </button>
                )}
              </li>
            ))}
            {pullRequest && (
              <li className="flex items-center gap-2 text-[13px]">
                <span className="text-[11px] font-semibold text-muted">PR</span>
                <a href={pullRequest.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                  {pullRequestLabel(pullRequest)}
                </a>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>세션</span>
        {sessions.length === 0 && (
          <p className="text-[13px] text-muted">
            붙은 세션이 없어요. 카드의 워크트리나 지라 키로 연 세션은 자동으로 붙고, 에이전트 카드나 지난 세션에서 ‘할일에 붙이기’로도 붙일 수 있어요.
          </p>
        )}
        {openSessions.length > 0 && (
          <>
            <span className="text-[11px] text-muted">{`열린 세션 ${openSessions.length}`}</span>
            <ul className="flex flex-col gap-1.5">
              {openSessions.map((session) => (
                <li key={session.id} className="flex items-center gap-2 text-[13px]">
                  {session.agent && <StateBadge agent={session.agent} />}
                  <span className="min-w-0 flex-1 truncate">{session.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!session.agent) return;
                      onClose();
                      onJumpToAgent(session.agent);
                    }}
                    className={QUIET_LINK}
                  >
                    에이전트로 이동
                  </button>
                  <button type="button" onClick={() => void onRun({ type: "session-detach", cardId: card.id, sessionId: session.id })} className="text-muted hover:text-fg">
                    떼기
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {pastSessions.length > 0 && (
          <>
            <span className="mt-1 text-[11px] text-muted">{`지난 세션 ${pastSessions.length}`}</span>
            <ul className="flex flex-col gap-1.5">
              {shownPast.map((session) => {
                const resume = resumeAction(session);
                return (
                  <li key={session.id} className="flex items-center gap-2 text-[13px]">
                    <span className="w-14 shrink-0 text-[11px] text-muted">
                      {session.summary ? new Date(session.summary.updatedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "닫힘"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <PendingButton
                      disabled={!resume}
                      title={resume ? undefined : "세션 폴더가 없어 다시 열 수 없어요"}
                      onRun={async () => {
                        if (resume) await onAction(resume);
                      }}
                      pendingLabel="여는 중"
                      className={`${QUIET_LINK} disabled:no-underline disabled:opacity-40`}
                    >
                      다시 열기
                    </PendingButton>
                    <button type="button" onClick={() => void onRun({ type: "session-detach", cardId: card.id, sessionId: session.id })} className="text-muted hover:text-fg">
                      떼기
                    </button>
                  </li>
                );
              })}
            </ul>
            {pastSessions.length > PAST_PREVIEW && (
              <button type="button" onClick={() => setShowAllPast((current) => !current)} className={`self-start text-[12px] ${QUIET_LINK}`}>
                {showAllPast ? "접기" : `지난 세션 모두 보기 (${pastSessions.length})`}
              </button>
            )}
          </>
        )}
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
