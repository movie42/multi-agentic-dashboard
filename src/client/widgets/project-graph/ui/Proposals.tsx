"use client";

import { useState } from "react";
import type { WorktreeProposal } from "@/common/orchestration/types";
import { postAction } from "@/client/shared/api/actions";
import { toastError } from "@/client/shared/model/toastStore";

interface ProposalsProps {
  proposals: WorktreeProposal[];
}

export function Proposals({ proposals }: ProposalsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  if (proposals.length === 0) return null;
  const act = async (proposal: WorktreeProposal, accept: boolean) => {
    setBusy(proposal.id);
    try {
      await postAction(accept ? { type: "accept-proposal", proposalId: proposal.id } : { type: "reject-proposal", proposalId: proposal.id });
    } catch (error) {
      toastError(accept ? "accept-proposal" : "reject-proposal", error);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {proposals.map((proposal) => (
        <div key={proposal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-bg px-3.5 py-2.5 text-[12.5px] shadow-lg ring-1 ring-focus/40">
          <span className="font-semibold text-focus">지휘자가 새 워크트리를 제안했어요</span>
          <span className="font-mono text-[12px]">
            {proposal.name} · {proposal.branch} ← {proposal.baseBranch}
          </span>
          {proposal.prompt && <span className="w-full truncate text-muted">첫 요청: {proposal.prompt}</span>}
          <span className="ml-auto flex gap-1.5">
            <button
              type="button"
              disabled={busy === proposal.id}
              onClick={() => void act(proposal, false)}
              className="rounded-full px-3 py-1 font-semibold text-muted hover:text-fg disabled:opacity-40"
            >
              거절
            </button>
            <button
              type="button"
              disabled={busy === proposal.id}
              onClick={() => void act(proposal, true)}
              className="rounded-full bg-focus px-3 py-1 font-semibold text-bg disabled:opacity-40"
            >
              만들기
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
