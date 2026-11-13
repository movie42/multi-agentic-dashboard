"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StateBadge } from "@/client/entities/agent";
import { postAction } from "@/client/shared/api/actions";
import { plainMessage } from "@/client/shared/lib/format";
import { useDraft } from "@/client/shared/lib/useDraft";
import { useStoredList } from "@/client/shared/lib/useStoredList";
import type { GraphCommit } from "@/common/gitGraph/types";
import type { AgentCard } from "@/common/orca/types";
import { SessionConversation } from "./SessionConversation";

const NEW_SESSION = "new";

interface AgentComposerProps {
  worktreePath: string;
  /** Sessions in this worktree that still have an Orca terminal to type into. */
  sessions: AgentCard[];
  attached: GraphCommit[];
  onDetach: (sha: string) => void;
  onClose: () => void;
}

function sessionLabel(agent: AgentCard, fromGraph: boolean): string {
  const text = agent.session?.title ?? agent.prompt ?? plainMessage(agent.lastMessage);
  return `${fromGraph ? "◆ " : ""}${text ? text.slice(0, 60) : agent.id}`;
}

function commitLine(commit: GraphCommit): string {
  const names = commit.refs.filter((ref) => ref.kind !== "head").map((ref) => ref.name);
  return `- ${commit.sha.slice(0, 10)} "${commit.subject}"${names.length > 0 ? ` (${names.join(", ")})` : ""}`;
}

export function composeMessage(text: string, attached: GraphCommit[]): string {
  if (attached.length === 0) return text.trim();
  return `깃 그래프에서 고른 커밋:\n${attached.map(commitLine).join("\n")}\n\n${text.trim()}`;
}

export function AgentComposer({ worktreePath, sessions, attached, onDetach, onClose }: AgentComposerProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useDraft(`git-graph-draft:${worktreePath}`);
  const [fromGraph, writeFromGraph] = useStoredList(`git-graph-sessions:${worktreePath}`);
  // Session ids that existed when this window launched one; the first id outside it is that launch.
  const [launchBaseline, setLaunchBaseline] = useState<string[] | null>(null);
  const launched = launchBaseline ? (sessions.find((agent) => !launchBaseline.includes(agent.id)) ?? null) : null;
  const waitingForLaunch = launchBaseline !== null && launched === null && chosen === null;

  const ordered = [...sessions].sort((a, b) => Number(fromGraph.includes(b.id)) - Number(fromGraph.includes(a.id)));
  const target =
    chosen === NEW_SESSION || waitingForLaunch
      ? null
      : (sessions.find((agent) => agent.id === chosen) ?? launched ?? ordered[0] ?? null);
  const terminalHandle = target?.terminalHandle ?? null;

  const launchedId = launched?.id ?? null;
  useEffect(() => {
    if (launchedId && !fromGraph.includes(launchedId)) writeFromGraph([...fromGraph, launchedId]);
    // Only a newly seen launch is recorded; the stored list and its writer are read fresh each run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchedId]);

  const sending = useMutation({
    mutationFn: async (message: string) => {
      if (terminalHandle) {
        await postAction({ type: "send-prompt", terminalHandle, text: message });
        return;
      }
      const baseline = sessions.map((agent) => agent.id);
      await postAction({ type: "launch-agent", worktreePath, prompt: message });
      setLaunchBaseline(baseline);
      setChosen(null);
    },
    onSuccess: () => setText(""),
  });

  const canSend = text.trim().length > 0 && !sending.isPending && !waitingForLaunch;
  const send = () => {
    if (canSend) sending.mutate(composeMessage(text, attached));
  };

  return (
    <section aria-label="에이전트에게 말하기" className="flex flex-col gap-2 border-t border-hair pt-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">에이전트에게 말하기</span>
        <select
          aria-label="보낼 세션"
          value={target ? target.id : NEW_SESSION}
          disabled={waitingForLaunch}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            setChosen(event.target.value);
            sending.reset();
          }}
          className="max-w-96 rounded-md bg-tint px-2 py-1 outline-none"
        >
          {ordered.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {sessionLabel(agent, fromGraph.includes(agent.id))}
            </option>
          ))}
          <option value={NEW_SESSION}>새 세션 시작</option>
        </select>
        {target && <StateBadge agent={target} />}
        <button type="button" aria-label="대화창 닫기" onClick={onClose} className="ml-auto text-[18px] leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>

      {waitingForLaunch ? (
        <p className="flex items-center gap-2 rounded-md bg-tint px-3 py-2 text-muted">
          새 세션이 뜨기를 기다리는 중이에요. 뜨면 여기서 바로 대화를 이어 갈 수 있어요.
          <button type="button" onClick={() => setLaunchBaseline(null)} className="ml-auto text-[12px] underline underline-offset-2 hover:text-fg">
            기다리지 않기
          </button>
        </p>
      ) : (
        target && <SessionConversation key={target.id} agent={target} />
      )}

      {attached.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {attached.map((commit) => (
            <li key={commit.sha} className="flex max-w-80 items-center gap-1 rounded-full bg-tint-2 py-0.5 pr-1 pl-2.5 text-[12px]">
              <span className="font-mono text-muted">{commit.sha.slice(0, 7)}</span>
              <span className="truncate">{commit.subject}</span>
              <button
                type="button"
                aria-label={`${commit.sha.slice(0, 7)} 빼기`}
                onClick={() => onDetach(commit.sha)}
                className="rounded-full px-1 text-muted hover:text-fg"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 rounded-[10px] px-3 py-2 shadow-[inset_0_0_0_1px_var(--hair)] focus-within:shadow-[inset_0_0_0_1.5px_var(--faint)]">
        <textarea
          autoFocus
          rows={1}
          value={text}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setText(event.target.value);
            if (!sending.isPending) sending.reset();
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            send();
          }}
          placeholder={
            target
              ? target.state === "working"
                ? "작업 중이에요 · 보내면 다음 차례로 줄 서요"
                : "예: 이 커밋을 main 위로 리베이스해 줘 · Enter 보내기"
              : "새 세션에 줄 첫 요청 · Enter 보내기"
          }
          className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="shrink-0 rounded-full bg-fg px-3 py-1 text-[12px] leading-5 font-semibold text-bg hover:opacity-85 disabled:opacity-30"
        >
          {sending.isPending ? "보내는 중" : target ? "보내기" : "세션 시작"}
        </button>
      </div>
      {sending.isSuccess && target && <p className="text-[12px] text-muted">보냈어요. 답은 위에 떠요.</p>}
      {sending.error && <p className="text-[12px] text-accent">못 보냈어요: {sending.error.message}</p>}
    </section>
  );
}
