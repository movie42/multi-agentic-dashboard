import type { SwitchBranchRequest } from "@/common/gitGraph/schema";
import { dirtyCount, parseWorktreeList, runGit, tryGit } from "./git";

async function refExists(cwd: string, ref: string): Promise<boolean> {
  return (await tryGit(cwd, ["show-ref", "--verify", "--quiet", ref])) !== null;
}

async function assertValidBranchName(cwd: string, name: string): Promise<void> {
  if ((await tryGit(cwd, ["check-ref-format", "--branch", name])) === null) {
    throw new Error(`'${name}'은 브랜치 이름으로 쓸 수 없어요`);
  }
}

async function assertNotCheckedOutElsewhere(cwd: string, branch: string): Promise<void> {
  const [list, top] = await Promise.all([runGit(cwd, ["worktree", "list", "--porcelain"]), runGit(cwd, ["rev-parse", "--show-toplevel"])]);
  const holder = parseWorktreeList(list)[branch];
  if (holder && holder !== top.trim()) throw new Error(`'${branch}'은 다른 워크트리(${holder})에서 쓰고 있어요`);
}

/** Switches the worktree's branch; refuses while tracked files have uncommitted changes. Returns the branch now checked out. */
export async function switchBranch(request: SwitchBranchRequest): Promise<string> {
  const cwd = request.worktreePath;
  const dirty = await dirtyCount(cwd);
  if (dirty > 0) throw new Error(`커밋 안 한 변경이 ${dirty}개 있어서 전환하지 않았어요. 커밋하거나 stash한 뒤 다시 해 주세요`);

  if (request.kind === "local") {
    await assertValidBranchName(cwd, request.branch);
    if (!(await refExists(cwd, `refs/heads/${request.branch}`))) throw new Error(`로컬 브랜치 '${request.branch}'가 없어요`);
    await assertNotCheckedOutElsewhere(cwd, request.branch);
    await runGit(cwd, ["switch", request.branch]);
    return request.branch;
  }

  if (request.kind === "remote") {
    if (!(await refExists(cwd, `refs/remotes/${request.remoteBranch}`))) throw new Error(`원격 브랜치 '${request.remoteBranch}'가 없어요`);
    const slash = request.remoteBranch.indexOf("/");
    const local = request.remoteBranch.slice(slash + 1);
    if (slash <= 0 || !local) throw new Error(`'${request.remoteBranch}'에서 로컬 브랜치 이름을 못 읽었어요`);
    await assertValidBranchName(cwd, local);
    if (await refExists(cwd, `refs/heads/${local}`)) throw new Error(`로컬 브랜치 '${local}'가 이미 있어요. 그 브랜치로 전환해 주세요`);
    await runGit(cwd, ["switch", "-c", local, "--track", request.remoteBranch]);
    return local;
  }

  await assertValidBranchName(cwd, request.name);
  if (await refExists(cwd, `refs/heads/${request.name}`)) throw new Error(`브랜치 '${request.name}'가 이미 있어요`);
  await runGit(cwd, ["switch", "-c", request.name, request.from]);
  return request.name;
}
