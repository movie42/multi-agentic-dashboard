"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BOARD_POLL_MS, boardQueryOptions } from "@/client/entities/board";
import { gitGraphHref, gitGraphKeys, gitGraphQueryOptions, workingTreeQueryOptions } from "@/client/entities/git-graph";
import { useToastStore } from "@/client/shared/model/toastStore";
import type { MenuPoint } from "@/client/shared/ui/ContextMenu";
import { Spinner } from "@/client/shared/ui/Spinner";
import type { GraphCommit } from "@/common/gitGraph/types";
import { layoutGraph } from "../model/layout";
import { AgentComposer } from "./AgentComposer";
import { CommitDetail } from "./CommitDetail";
import { GraphMenu } from "./GraphMenu";
import { GraphRow, graphWidth, WORKING_SHA } from "./GraphRow";
import { WorkingTreeDetail } from "./WorkingTreeDetail";

const BOARD_REFRESH_MS = 15_000;
const GRAPH_REFRESH_WHILE_WORKING_MS = 10_000;

const baseName = (worktreePath: string) => worktreePath.split("/").filter(Boolean).at(-1) ?? worktreePath;

interface GitGraphViewProps {
  /** The worktree the window opens on; the viewer can move to any other worktree of the repo. */
  worktreePath: string;
}

export function GitGraphView({ worktreePath }: GitGraphViewProps) {
  const [base, setBase] = useState(worktreePath);
  const changeBase = (next: string) => {
    setBase(next);
    window.history.replaceState(null, "", gitGraphHref(next));
  };
  return <WorktreeGraph key={base} worktreePath={base} onChangeBase={changeBase} />;
}

interface WorktreeGraphProps {
  worktreePath: string;
  onChangeBase: (worktreePath: string) => void;
}

function WorktreeGraph({ worktreePath, onChangeBase }: WorktreeGraphProps) {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [attached, setAttached] = useState<GraphCommit[]>([]);
  const board = useQuery({ ...boardQueryOptions(), refetchInterval: composerOpen ? BOARD_POLL_MS : BOARD_REFRESH_MS });
  const here = (board.data?.agents ?? []).filter((agent) => agent.worktreePath === worktreePath);
  const workingCount = here.filter((agent) => agent.state === "working").length;
  const graph = useInfiniteQuery({
    ...gitGraphQueryOptions(worktreePath),
    refetchInterval: workingCount > 0 ? GRAPH_REFRESH_WHILE_WORKING_MS : false,
  });
  const workingTree = useQuery(workingTreeQueryOptions(worktreePath));
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: MenuPoint; commit: GraphCommit } | null>(null);
  const askAbout = (commit: GraphCommit) => {
    setAttached((current) => (current.some((each) => each.sha === commit.sha) ? current : [...current, commit]));
    setComposerOpen(true);
  };

  if (graph.isPending) return <p className="text-[14px] text-muted">커밋을 읽는 중…</p>;
  if (graph.isError) return <p className="text-[14px] text-accent">{graph.error.message}</p>;

  const [first] = graph.data.pages;
  const commits = graph.data.pages.flatMap((page) => page.commits);
  const workingFiles = workingTree.data?.files ?? [];
  const changedCount = new Set(workingFiles.map((file) => file.path)).size;
  const trackedChanges = workingTree.data
    ? new Set(workingFiles.filter((file) => file.state !== "untracked").map((file) => file.path)).size
    : (first?.dirtyCount ?? 0);
  const headSha = first?.headSha ?? null;
  const workingRow: GraphCommit | null =
    changedCount > 0
      ? { sha: WORKING_SHA, parents: headSha ? [headSha] : [], author: "", time: 0, subject: "", refs: [] }
      : null;
  const rows = workingRow ? [workingRow, ...commits] : commits;
  const layout = layoutGraph(rows);
  const width = graphWidth(layout.laneCount);
  const checkedOut = first?.checkedOut ?? {};
  const localBranches = new Set(commits.flatMap((commit) => commit.refs.filter((ref) => ref.kind === "branch").map((ref) => ref.name)));
  const worktrees = first?.worktrees ?? [];
  const repoName = baseName(worktrees[0]?.path ?? worktreePath);
  const worktreesAt = (sha: string) =>
    worktrees
      .filter((worktree) => worktree.headSha === sha)
      .map((worktree) => ({ path: worktree.path, name: baseName(worktree.path), isBase: worktree.path === worktreePath }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: gitGraphKeys.graph(worktreePath) });

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-[24px] leading-tight font-bold tracking-[-0.015em]">{repoName}</h1>
        <label className="flex items-baseline gap-1.5 text-[12px] text-muted">
          기준 워크트리
          <select
            value={worktreePath}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChangeBase(event.target.value)}
            className="rounded-md bg-tint px-2 py-0.5 text-[13px] font-semibold text-fg outline-none"
          >
            {worktrees.every((worktree) => worktree.path !== worktreePath) && <option value={worktreePath}>{baseName(worktreePath)}</option>}
            {worktrees.map((worktree) => (
              <option key={worktree.path} value={worktree.path}>
                {baseName(worktree.path)}
                {worktree.branch && worktree.branch !== baseName(worktree.path) ? ` · ${worktree.branch}` : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-[13px]">
          {first?.currentBranch ? `● ${first.currentBranch}` : `HEAD 분리됨 · ${first?.headSha?.slice(0, 7) ?? "커밋 없음"}`}
        </span>
        {changedCount > 0 && <span className="text-[12px] text-ask">커밋 안 한 변경 {changedCount}개</span>}
        {workingCount > 0 && <span className="text-[12px] text-now">작업 중인 세션 {workingCount}</span>}
        <span className="ml-auto flex items-center gap-3 text-[12px] text-muted">
          <span>줄을 우클릭하면 브랜치를 바꾸거나 에이전트에게 물을 수 있어요</span>
          <button
            type="button"
            aria-pressed={composerOpen}
            onClick={() => setComposerOpen(!composerOpen)}
            className={`rounded-full px-2.5 py-0.5 ${composerOpen ? "bg-fg text-bg" : "border border-hair text-fg hover:bg-tint"}`}
          >
            에이전트에게 말하기
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={graph.isFetching}
            className="inline-flex items-center gap-1.5 rounded-full border border-hair px-2.5 py-0.5 text-fg hover:bg-tint disabled:text-muted"
          >
            {graph.isFetching && <Spinner />}
            새로고침
          </button>
        </span>
      </header>
      <p className="-mt-3 font-mono text-[12px] break-all text-muted">{worktreePath}</p>

      <div className={`grid min-h-0 flex-1 gap-0 ${selected ? "grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1"}`}>
        <div role="grid" aria-label="커밋 그래프" className="min-h-0 overflow-auto pb-10">
          {rows.length === 0 && <p className="text-[14px] text-muted">커밋이 없어요.</p>}
          {rows.map((commit, index) => {
            const row = layout.rows[index];
            if (!row) return null;
            return (
              <GraphRow
                key={commit.sha}
                commit={commit}
                layout={row}
                width={width}
                isHead={commit.sha === first?.headSha}
                selected={commit.sha === selected}
                menuOpen={menu?.commit.sha === commit.sha}
                checkedOut={checkedOut}
                worktreePath={worktreePath}
                onSelect={() => setSelected(commit.sha === selected ? null : commit.sha)}
                onMenu={(event) => {
                  if (commit !== workingRow) setMenu({ at: { x: event.clientX, y: event.clientY }, commit });
                }}
                workingCount={commit === workingRow ? changedCount : undefined}
                worktreesHere={commit === workingRow ? [] : worktreesAt(commit.sha)}
                onPickWorktree={onChangeBase}
              />
            );
          })}
          {graph.hasNextPage && (
            <button
              type="button"
              onClick={() => void graph.fetchNextPage()}
              disabled={graph.isFetchingNextPage}
              className="mt-3 ml-3 inline-flex items-center gap-1.5 rounded-full border border-hair px-3 py-1 text-[13px] hover:bg-tint disabled:text-muted"
            >
              {graph.isFetchingNextPage && <Spinner />}
              커밋 더 보기
            </button>
          )}
        </div>
        {selected === WORKING_SHA && (
          <WorkingTreeDetail worktreePath={worktreePath} files={workingFiles} onClose={() => setSelected(null)} />
        )}
        {selected && selected !== WORKING_SHA && (
          <CommitDetail key={selected} worktreePath={worktreePath} sha={selected} onClose={() => setSelected(null)} onSelectParent={setSelected} />
        )}
      </div>

      {composerOpen && (
        <AgentComposer
          worktreePath={worktreePath}
          sessions={here.filter((agent) => agent.terminalHandle !== null)}
          attached={attached}
          onDetach={(sha) => setAttached(attached.filter((commit) => commit.sha !== sha))}
          onClose={() => setComposerOpen(false)}
        />
      )}

      {menu && (
        <GraphMenu
          at={menu.at}
          commit={menu.commit}
          context={{ worktreePath, checkedOut, localBranches, dirtyCount: trackedChanges, workingCount }}
          onClose={() => setMenu(null)}
          onAskAgent={() => askAbout(menu.commit)}
          onSwitched={(branch) => {
            useToastStore.getState().show(`이 워크트리를 ${branch}(으)로 전환했어요`);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
