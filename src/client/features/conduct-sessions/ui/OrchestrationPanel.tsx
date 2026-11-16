"use client";

import { startTransition, useActionState } from "react";
import type { ActionRequest } from "@/common/actions/schema";
import type { OrchestrationLink, SessionOrchestration, WorktreeRequest } from "@/common/orchestration/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";
import { GRANT_LABEL, SCOPE_LABEL } from "./ConductorLauncher";
const LINK_LABEL: Record<OrchestrationLink["kind"], string> = { delegate: "맡김", report: "끝나면 보고", next: "끝나면 다음" };

const PRIMARY =
  "cursor-pointer rounded-full bg-fg px-3.5 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:cursor-default disabled:opacity-30";
const SECONDARY =
  "cursor-pointer rounded-full px-3.5 py-1 text-[12px] leading-5 font-semibold shadow-[inset_0_0_0_1px_var(--hair)] hover:bg-tint-2 disabled:cursor-default disabled:opacity-30";

type ActionResult = { kind: "idle" } | { kind: "done" } | { kind: "error" };

function useAction() {
  const [result, dispatch, pending] = useActionState<ActionResult, ActionRequest>(async (_previous, action) => {
    try {
      await postAction(action);
      return { kind: "done" };
    } catch (error) {
      toastError("orchestration", error);
      return { kind: "error" };
    }
  }, { kind: "idle" });
  return { result, pending, run: (action: ActionRequest) => startTransition(() => dispatch(action)) };
}

interface WorktreeRequestRowProps {
  terminalHandle: string;
  request: WorktreeRequest;
}

function WorktreeRequestRow({ terminalHandle, request }: WorktreeRequestRowProps) {
  const { result, pending, run } = useAction();
  const answer = (approve: boolean) => run({ type: "answer-worktree-request", terminalHandle, requestId: request.id, approve });
  const locked = pending || result.kind === "done";
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-bg p-3 shadow-[inset_0_0_0_1.5px_var(--st-ask)]">
      <p className="text-[14px] font-bold">지휘자가 새 워크트리를 만들려고 해요</p>
      <p className="text-[13px]">
        <code className="font-mono">{request.branch}</code>
        {request.base && <span className="text-muted"> · {request.base}에서</span>} — {request.reason}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={locked} onClick={() => answer(true)} className={PRIMARY}>
          {pending ? "만드는 중" : "만들기"}
        </button>
        <button type="button" disabled={locked} onClick={() => answer(false)} className={`${SECONDARY} text-accent`}>
          거절
        </button>
      </div>
    </div>
  );
}

interface PausedLinkRowProps {
  link: OrchestrationLink;
}

function PausedLinkRow({ link }: PausedLinkRowProps) {
  const { result, pending, run } = useAction();
  const locked = pending || result.kind === "done";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-tint-2 px-3 py-2 text-[13px]">
      <p className="min-w-0 flex-1">
        &lsquo;{LINK_LABEL[link.kind]}&rsquo; 연결이 같은 두 세션 사이를 {link.trips}번 오가서 멈췄어요. 확인한 뒤 다시 켜 주세요.
      </p>
      <button type="button" disabled={locked} onClick={() => run({ type: "resume-link", linkId: link.id })} className={SECONDARY}>
        다시 켜기
      </button>
      <button type="button" disabled={locked} onClick={() => run({ type: "unlink-sessions", linkId: link.id })} className={`${SECONDARY} text-accent`}>
        끊기
      </button>
    </div>
  );
}

interface OrchestrationPanelProps {
  terminalHandle: string;
  orchestration: SessionOrchestration;
}

/** What a person must see or settle on a session's card: its conductor role, a worktree request, stopped lines. */
export function OrchestrationPanel({ terminalHandle, orchestration }: OrchestrationPanelProps) {
  const { conductor, links } = orchestration;
  const paused = links.filter((link) => link.paused);
  if (!conductor && paused.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {conductor && (
        <p className="text-[12px] text-muted">
          지휘자 · {SCOPE_LABEL[conductor.scope.kind]} ({conductor.scope.paths.length}곳) · 맡긴 권한{" "}
          {conductor.grants.length > 0 ? conductor.grants.map((grant) => GRANT_LABEL[grant]).join(", ") : "없음"}
          {conductor.rules.length > 0 && ` + 규칙 ${conductor.rules.length}개`}
        </p>
      )}
      {conductor?.worktreeRequest && <WorktreeRequestRow key={conductor.worktreeRequest.id} terminalHandle={terminalHandle} request={conductor.worktreeRequest} />}
      {paused.map((link) => (
        <PausedLinkRow key={link.id} link={link} />
      ))}
    </div>
  );
}
