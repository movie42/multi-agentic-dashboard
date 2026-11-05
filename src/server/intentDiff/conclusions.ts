import {
  confirmConclusion,
  judgeConclusion,
  markSent,
  type ConclusionRequest,
} from "@/common/intentDiff/conclusion";
import type { AskConclusion, AskThread } from "@/common/intentDiff/types";

export interface ConclusionDeps {
  get: (id: string) => Promise<AskThread | null>;
  update: (ids: string[], change: (thread: AskThread) => AskThread) => Promise<AskThread[]>;
  draft: (thread: AskThread) => Promise<AskConclusion>;
  now: () => number;
}

function withConclusion(thread: AskThread, conclusion: AskConclusion | null, now: number): AskThread {
  return { ...thread, conclusion, updatedAt: now };
}

export async function concludeAsk(request: ConclusionRequest, deps: ConclusionDeps): Promise<AskThread[]> {
  const now = deps.now();
  if (request.type === "sent") {
    return deps.update(request.threadIds, (thread) =>
      thread.conclusion ? withConclusion(thread, markSent(thread.conclusion, now), now) : thread,
    );
  }
  const thread = await deps.get(request.threadId);
  if (!thread) throw new Error("대화를 찾지 못했어요");
  if (request.type === "draft") {
    const drafted = await deps.draft(thread);
    return deps.update([thread.id], (current) => withConclusion(current, drafted, deps.now()));
  }
  return deps.update([thread.id], (current) => {
    const conclusion = current.conclusion ?? { text: "", needsChange: true, draftedAt: now, confirmedAt: null, sentAt: null };
    if (request.type === "judge") return withConclusion(current, judgeConclusion(conclusion, request.needsChange, now), now);
    return withConclusion(current, confirmConclusion(conclusion, request.text, now), now);
  });
}
