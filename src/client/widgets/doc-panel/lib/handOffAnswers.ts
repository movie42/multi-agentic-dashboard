import type { AgentCard } from "@/common/orca/types";
import type { ActionRequest } from "@/common/actions/schema";
import { flowTaskOf } from "@/client/features/view-doc";

function folderOf(file: string): string {
  return file.slice(0, file.lastIndexOf("/") + 1);
}

/**
 * The session that made a flow page is the live agent that listed a page from the same task folder
 * among its artifacts; the most recently active one wins.
 */
export function docSession(agents: readonly AgentCard[], page: string): AgentCard | null {
  const folder = folderOf(page);
  const owners = agents.filter(
    (agent) => agent.terminalHandle && agent.artifacts.some((artifact) => folderOf(artifact.target) === folder),
  );
  return owners.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
}

export type HandOff = { action: ActionRequest; where: "session" | "new" } | null;

/** Sends to the document's own session when it is still open, otherwise starts one in the worktree. */
export function handOffAnswers(agents: readonly AgentCard[], page: string): HandOff {
  const task = flowTaskOf(page);
  if (!task) return null;
  const message = `앱 문서 패널에서 ${task.task} 질문에 답했어요. 답을 반영하고 질문 라운드를 갱신해 주세요.`;
  const owner = docSession(agents, page);
  if (owner?.terminalHandle) {
    return { action: { type: "send-prompt", terminalHandle: owner.terminalHandle, text: message }, where: "session" };
  }
  return { action: { type: "launch-agent", worktreePath: task.worktreePath, prompt: `/flow ${message}` }, where: "new" };
}
