import type { GitGraph } from "@/common/gitGraph/types";
import { dirtyCount, parseWorktreeEntries, parseWorktreeList, runGit, tryGit } from "./git";
import { LOG_FORMAT, parseLog } from "./parseLog";

export const GRAPH_PAGE = 300;

export async function readGraph(worktreePath: string, skip = 0, limit = GRAPH_PAGE): Promise<GitGraph> {
  const [log, worktrees, dirty, headSha, currentBranch] = await Promise.all([
    runGit(worktreePath, [
      "log",
      "--exclude=refs/stash",
      "--all",
      "--topo-order",
      "--decorate=full",
      `--format=${LOG_FORMAT}`,
      `--skip=${skip}`,
      `--max-count=${limit + 1}`,
    ]),
    runGit(worktreePath, ["worktree", "list", "--porcelain"]),
    dirtyCount(worktreePath),
    tryGit(worktreePath, ["rev-parse", "HEAD"]),
    tryGit(worktreePath, ["symbolic-ref", "--short", "-q", "HEAD"]),
  ]);
  const commits = parseLog(log);
  return {
    worktreePath,
    headSha: headSha || null,
    currentBranch: currentBranch || null,
    commits: commits.slice(0, limit),
    hasMore: commits.length > limit,
    worktrees: parseWorktreeEntries(worktrees),
    checkedOut: parseWorktreeList(worktrees),
    dirtyCount: dirty,
  };
}
