"use client";

import { useState } from "react";
import type { ActionRequest } from "@/lib/orca/actions";
import type { AgentCard, AgentState, Artifact } from "@/lib/orca/types";
import type { PullRequestInfo, WorkflowStep } from "@/lib/workflow/types";
import { formatElapsed } from "./format";
import { ChoicePanel } from "./ChoicePanel";
import { MessageView } from "./MessageView";
import { PermissionPanel } from "./PermissionPanel";
import { BookmarkMemo, BookmarkStar, bookmarkTarget } from "./SessionBookmarkControl";
import { QuickReply } from "./QuickReply";
import { SessionTitle } from "./SessionTitle";
import { Stepper } from "./Stepper";

export interface CardProgress {
  taskId: string;
  title: string;
  steps: WorkflowStep[];
}

const STATE_LABEL: Record<AgentState, string> = {
  blocked: "막힘",
  waiting: "내 입력 대기",
  done: "내 차례",
  working: "에이전트 작업 중",
  idle: "쉬는 중",
};

const STATE_PILL: Record<AgentState, string> = {
  blocked: "bg-accent text-accent-ink",
  waiting: "bg-accent text-accent-ink",
  done: "bg-ask text-st-ink",
  working: "text-now shadow-[inset_0_0_0_1.5px_var(--st-now)]",
  idle: "text-muted shadow-[inset_0_0_0_1px_var(--hair)]",
};

const TITLE_TEXT = "text-[16px] leading-snug font-bold tracking-[-0.01em]";

const ARTIFACT_LABEL: Record<Artifact["kind"], string> = {
  html: "HTML",
  markdown: "MD",
  file: "FILE",
  artifact: "ARTIFACT",
  pr: "PR",
};

type PrTone = "open" | "merged" | "muted";

const PR_TONE: Record<PrTone, string> = {
  open: "bg-pr/10 text-pr hover:bg-pr hover:text-st-ink",
  merged: "bg-pr text-st-ink hover:opacity-85",
  muted: "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg",
};

const PR_STATE_LABEL = { OPEN: "열림", MERGED: "머지됨", CLOSED: "닫힘" } as const;

interface PrChip {
  url: string;
  label: string;
  state: string | null;
  tone: PrTone;
}

function collectPullRequests(agent: AgentCard, worktreePr: PullRequestInfo | null): PrChip[] {
  const chips: PrChip[] = [];
  if (worktreePr?.kind === "found") {
    chips.push({
      url: worktreePr.url,
      label: `#${worktreePr.number}`,
      state: worktreePr.isDraft ? "초안" : PR_STATE_LABEL[worktreePr.state],
      tone: worktreePr.state === "MERGED" ? "merged" : worktreePr.state === "OPEN" && !worktreePr.isDraft ? "open" : "muted",
    });
  }
  for (const artifact of agent.artifacts) {
    if (artifact.kind !== "pr" || chips.some((chip) => chip.url.startsWith(artifact.target))) continue;
    chips.push({ url: artifact.target, label: artifact.label, state: null, tone: "open" });
  }
  return chips;
}

interface StateBadgeProps {
  agent: AgentCard;
}

export function StateBadge({ agent }: StateBadgeProps) {
  const interrupted = agent.interrupted && agent.state !== "working";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-semibold whitespace-nowrap ${
        interrupted ? "bg-accent text-accent-ink" : STATE_PILL[agent.state]
      }`}
    >
      {agent.state === "working" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {interrupted ? "중단됨" : STATE_LABEL[agent.state]}
    </span>
  );
}

interface AgentCardViewProps {
  agent: AgentCard;
  now: number;
  progress: CardProgress | null;
  worktreePr: PullRequestInfo | null;
  dismissed: boolean;
  onToggleDismiss: () => void;
  onAction: (action: ActionRequest) => void;
}

export function AgentCardView({
  agent,
  now,
  progress,
  worktreePr,
  dismissed,
  onToggleDismiss,
  onAction,
}: AgentCardViewProps) {
  const terminalHandle = agent.terminalHandle;
  const [confirmingClose, setConfirmingClose] = useState(false);
  const openUrl = (target: string) =>
    onAction({ type: "open-artifact", target, via: "system", worktreePath: agent.worktreePath });
  const pullRequests = collectPullRequests(agent, worktreePr);
  const files = agent.artifacts.filter((artifact) => artifact.kind !== "pr");
  const showWorktree = agent.worktreeName !== agent.branch;
  const fallbackTitle = agent.prompt?.replace(/\s+/g, " ").slice(0, 80) ?? "제목 없음";
  const bookmark = agent.session
    ? bookmarkTarget(agent.session.id, agent.session.title ?? fallbackTitle, agent.worktreePath, agent.session.bookmark)
    : null;

  return (
    <article
      data-card
      data-card-id={agent.id}
      tabIndex={0}
      className="flex scroll-mt-6 flex-col gap-4 rounded-[10px] bg-tint p-5 outline-none focus-visible:shadow-[0_0_0_2px_var(--fg)]"
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <StateBadge agent={agent} />
          {agent.session ? (
            <SessionTitle
              key={agent.session.id}
              sessionId={agent.session.id}
              title={agent.session.title}
              titleSource={agent.session.titleSource}
              fallback={fallbackTitle}
              textClassName={TITLE_TEXT}
            />
          ) : (
            <p className={`min-w-0 flex-1 truncate ${TITLE_TEXT}`}>{fallbackTitle}</p>
          )}
          {agent.unread && <span className="size-2 shrink-0 rounded-full bg-accent" title="새 결과" />}
          <span className="shrink-0 text-[12px] text-muted">
            {formatElapsed(agent.stateSince, now)}
            {agent.state === "working" ? " 경과" : " 전"}
          </span>
          {agent.state !== "working" && (
            <button
              type="button"
              onClick={onToggleDismiss}
              className="shrink-0 text-[12px] text-muted hover:text-fg hover:underline"
              title={dismissed ? "내 차례로 되돌리기" : "처리했으니 내 차례에서 내리기"}
            >
              {dismissed ? "되돌리기" : "정리"}
            </button>
          )}
          {bookmark ? (
            <BookmarkStar target={bookmark} />
          ) : (
            <span className="shrink-0 text-[17px] leading-none text-faint" title="세션 기록을 찾지 못해 북마크할 수 없어요">
              ☆
            </span>
          )}
        </div>
        {bookmark && <BookmarkMemo target={bookmark} />}
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] leading-none">
          <span className="rounded-md bg-tint-2 px-2 py-1 font-semibold" title="프로젝트">
            {agent.repo}
          </span>
          {showWorktree && (
            <span className="rounded-md px-2 py-1 font-semibold shadow-[inset_0_0_0_1px_var(--hair)]" title="worktree">
              {agent.worktreeName}
            </span>
          )}
          {agent.branch && (
            <span className="max-w-72 truncate rounded-md bg-now/10 px-2 py-1 font-mono text-now" title="브랜치">
              ⎇ {agent.branch}
            </span>
          )}
          {pullRequests.map((pr) => (
            <button
              key={pr.url}
              type="button"
              onClick={() => openUrl(pr.url)}
              title={pr.url}
              className={`rounded-md px-2 py-1 font-semibold ${PR_TONE[pr.tone]}`}
            >
              PR {pr.label}
              {pr.state ? ` · ${pr.state}` : ""} ↗
            </button>
          ))}
          {agent.backgroundRunning && (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-now shadow-[inset_0_0_0_1px_var(--hair)]"
              title="에이전트는 답을 끝냈고, 백그라운드에서 돌려 둔 명령이 아직 실행 중이에요"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              백그라운드 실행 중
            </span>
          )}
          <span className="text-muted">
            {agent.agentType ?? "agent"}
            {agent.toolName && agent.state === "working" ? ` · ${agent.toolName}` : ""}
          </span>
        </div>
      </header>

      {progress && (
        <div className="flex flex-col gap-1.5">
          <p className="truncate text-[12px] text-muted">
            <span className="font-mono">{progress.taskId}</span> · {progress.title}
          </p>
          <Stepper steps={progress.steps} size="compact" />
        </div>
      )}

      {agent.prompt && (
        <p className="line-clamp-2 text-[14px] leading-relaxed text-muted">“{agent.prompt}”</p>
      )}

      <MessageView message={agent.lastMessage} />

      {agent.permission ? (
        <PermissionPanel key={agent.permission.id} permission={agent.permission} />
      ) : (
        terminalHandle &&
        (agent.state === "blocked" || agent.state === "waiting") && <ChoicePanel terminalHandle={terminalHandle} />
      )}

      {terminalHandle && <QuickReply terminalHandle={terminalHandle} working={agent.state === "working"} />}

      {(files.length > 0 || terminalHandle) && (
        <footer className="flex flex-wrap items-center gap-1.5">
          {files.map((artifact, index) => (
            <button
              key={artifact.target}
              type="button"
              data-open-artifact={index === 0 ? "" : undefined}
              title={`${artifact.target}\n클릭: 기본 앱으로 열기${artifact.kind === "artifact" ? "" : " · ⌥클릭: Orca 탭으로 열기"}`}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) =>
                onAction({
                  type: "open-artifact",
                  target: artifact.target,
                  via: event.altKey && artifact.kind !== "artifact" ? "orca" : "system",
                  worktreePath: agent.worktreePath,
                })
              }
              className="flex max-w-64 items-center gap-1.5 rounded-full bg-tint-2 px-3 py-1 text-[13px] hover:bg-fg hover:text-bg"
            >
              <span className="font-mono text-[10px] opacity-60">{ARTIFACT_LABEL[artifact.kind]}</span>
              <span className="truncate">{artifact.label}</span>
            </button>
          ))}
          {terminalHandle &&
            (confirmingClose ? (
              <span className="ml-auto flex items-center gap-1.5 text-[13px]">
                <span className="text-muted">이 세션을 닫을까요?</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingClose(false);
                    onAction({ type: "close-terminal", terminalHandle });
                  }}
                  className="rounded-full bg-accent px-3 py-1 leading-none font-semibold text-accent-ink hover:opacity-85"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  className="rounded-full px-3 py-1 leading-none text-muted hover:text-fg"
                >
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClose(true)}
                title="Orca 터미널을 닫아요. 세션 기록은 남아서 세션 목록에서 다시 열 수 있어요"
                className="ml-auto rounded-full px-3 py-1.5 text-[13px] leading-none text-muted hover:text-fg"
              >
                세션 닫기
              </button>
            ))}
          {terminalHandle && (
            <button
              type="button"
              data-continue
              onClick={() => onAction({ type: "focus-terminal", terminalHandle })}
              className="rounded-full bg-fg px-3.5 py-1.5 text-[13px] leading-none font-semibold text-bg hover:opacity-85"
            >
              Orca에서 이어가기 →
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
