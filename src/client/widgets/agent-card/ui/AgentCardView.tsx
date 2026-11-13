"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { AgentCard, Artifact } from "@/common/board/types";
import type { PullRequestInfo, WorkflowStep } from "@/common/workflow/types";
import { formatElapsed } from "@/client/shared/lib/format";
import { useCardView, type CardView } from "../model/cardViewStore";
import { ActivityList } from "./ActivityTimeline";
import { ChatView } from "./ChatView";
import { MessageView } from "./MessageView";
import { PermissionPrompt } from "@/client/features/answer-permission";
import { ModelPicker } from "@/client/features/choose-model";
import { AttachToTodo } from "@/client/features/attach-to-todo";
import { BookmarkMemo, BookmarkStar, bookmarkTarget } from "@/client/features/bookmark-session";
import { QuickReply } from "@/client/features/quick-reply";
import { SessionTitle } from "@/client/features/rename-session";
import { Stepper } from "@/client/entities/workflow";
import { StateBadge } from "@/client/entities/agent";
import { RunnerTerminal, useTerminalRequest } from "@/client/entities/runner";
import { PendingButton } from "@/client/shared/ui/PendingButton";

export interface CardProgress {
  taskId: string;
  title: string;
  steps: WorkflowStep[];
}

const TITLE_TEXT = "text-[16px] leading-snug font-bold tracking-[-0.01em]";

const VIEW_TABS: { key: Exclude<CardView, "history">; label: string }[] = [
  { key: "chat", label: "채팅" },
  { key: "terminal", label: "터미널" },
];

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

interface AgentCardViewProps {
  agent: AgentCard;
  now: number;
  progress: CardProgress | null;
  worktreePr: PullRequestInfo | null;
  dismissed: boolean;
  onToggleDismiss: () => void;
  onAction: (action: ActionRequest) => Promise<void>;
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
  const cardRef = useRef<HTMLElement>(null);
  const terminalRequest = useTerminalRequest(terminalHandle);
  const isShell = agent.agentType === "shell";
  const [picked, setPicked] = useCardView(agent.id);
  const requestedView: CardView = terminalRequest > 0 || isShell ? "terminal" : "chat";
  const view: CardView = isShell ? "terminal" : picked && picked.request === terminalRequest ? picked.view : requestedView;
  const pick = (next: CardView) => setPicked({ view: next, request: terminalRequest });
  useEffect(() => {
    if (terminalRequest > 0) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [terminalRequest]);
  const openUrl = (target: string) => onAction({ type: "open-artifact", target });
  const pullRequests = collectPullRequests(agent, worktreePr);
  const files = agent.artifacts.filter((artifact) => artifact.kind !== "pr");
  const showWorktree = agent.worktreeName !== agent.branch;
  const fallbackTitle = agent.prompt?.replace(/\s+/g, " ").slice(0, 80) ?? (agent.agentType === "shell" ? "터미널" : "제목 없음");
  const bookmark = agent.session
    ? bookmarkTarget(agent.session.id, agent.session.title ?? fallbackTitle, agent.worktreePath, agent.session.bookmark)
    : null;

  return (
    <article
      ref={cardRef}
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
          {agent.session && (
            <AttachToTodo
              target={{
                sessionId: agent.session.id,
                title: agent.session.title ?? fallbackTitle,
                repo: agent.repo,
                worktreePath: agent.worktreePath,
              }}
            />
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

      {!isShell && (
        <div className="flex items-center gap-1.5 text-[12px]">
          <div role="tablist" aria-label="카드 화면" className="flex rounded-full bg-tint-2 p-0.5">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                data-card-view={tab.key}
                aria-selected={view === tab.key}
                disabled={tab.key === "terminal" && !terminalHandle}
                onClick={() => pick(tab.key)}
                className={`rounded-full px-3 py-1 leading-none font-semibold disabled:opacity-40 ${
                  view === tab.key ? "bg-bg text-fg shadow-[0_0_0_1px_var(--hair)]" : "text-muted hover:text-fg"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {agent.session && (
            <button
              type="button"
              data-card-view="history"
              aria-pressed={view === "history"}
              onClick={() => pick(view === "history" ? "chat" : "history")}
              className={`rounded-full px-3 py-1 leading-none ${
                view === "history" ? "bg-fg font-semibold text-bg" : "text-muted shadow-[inset_0_0_0_1px_var(--hair)] hover:text-fg"
              }`}
            >
              진행 기록
            </button>
          )}
        </div>
      )}

      {view === "chat" &&
        (agent.session ? (
          <ChatView
            key={`chat-${agent.session.id}`}
            sessionId={agent.session.id}
            working={agent.state === "working"}
            footer={
              agent.permission && terminalHandle ? (
                <PermissionPrompt key={agent.permission.id} terminalHandle={terminalHandle} permission={agent.permission} />
              ) : null
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {agent.prompt && <p className="line-clamp-2 text-[14px] leading-relaxed text-muted">“{agent.prompt}”</p>}
            <MessageView message={agent.lastMessage} />
            {agent.permission && terminalHandle && (
              <PermissionPrompt key={agent.permission.id} terminalHandle={terminalHandle} permission={agent.permission} />
            )}
          </div>
        ))}

      {view === "history" && agent.session && <ActivityList key={`activity-${agent.session.id}`} sessionId={agent.session.id} />}

      {view === "terminal" && terminalHandle && (
        <div className="h-[420px]">
          <RunnerTerminal key={terminalHandle} sessionId={terminalHandle} />
        </div>
      )}

      {terminalHandle && !isShell && view !== "terminal" && (
        <div className="flex flex-col gap-1.5">
          <QuickReply terminalHandle={terminalHandle} working={agent.state === "working"} />
          <div className="flex flex-wrap items-center gap-2 px-1">
            <ModelPicker terminalHandle={terminalHandle} model={agent.model} />
            {agent.contextPercent !== null && (
              <span
                data-context-percent
                className="text-[12px] text-muted tabular-nums"
                title="지금 대화가 모델의 컨텍스트 창을 얼마나 채웠는지예요"
              >
                컨텍스트 {agent.contextPercent}%
              </span>
            )}
          </div>
        </div>
      )}

      {(files.length > 0 || terminalHandle) && (
        <footer className="flex flex-wrap items-center gap-1.5">
          {files.map((artifact, index) => (
            <button
              key={artifact.target}
              type="button"
              data-open-artifact={index === 0 ? "" : undefined}
              title={`${artifact.target}\n클릭: 기본 앱으로 열기`}
              onClick={() => onAction({ type: "open-artifact", target: artifact.target })}
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
                <PendingButton
                  onRun={async () => {
                    await onAction({ type: "close-terminal", terminalHandle });
                    setConfirmingClose(false);
                  }}
                  pendingLabel="닫는 중"
                  className="rounded-full bg-accent px-3 py-1 leading-none font-semibold text-accent-ink hover:opacity-85 disabled:opacity-70"
                >
                  닫기
                </PendingButton>
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
                title="세션을 닫아요. 세션 기록은 남아서 세션 목록에서 다시 열 수 있어요"
                className="ml-auto rounded-full px-3 py-1.5 text-[13px] leading-none text-muted hover:text-fg"
              >
                세션 닫기
              </button>
            ))}
        </footer>
      )}
    </article>
  );
}
