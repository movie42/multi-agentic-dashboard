import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { WizardOrigin } from "@/common/worktreeWizard/types";
import { services } from "@/server/container";

const execFileAsync = promisify(execFile);
const MAX_BRANCHES = 80;

const WorktreeListSchema = z.object({
  worktrees: z.array(z.object({ repoId: z.string(), path: z.string(), branch: z.string().nullable(), displayName: z.string() })),
});

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], { timeout: 10_000 });
  return stdout.trim();
}

async function defaultBranch(cwd: string): Promise<string | null> {
  const head = await git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).catch(() => "");
  return head ? head.replace(/^origin\//, "") : null;
}

/** The facts the skill would otherwise look up itself, as prompt text. */
export async function describeOrigin(origin: WizardOrigin): Promise<string> {
  const [branches, base, listed] = await Promise.all([
    git(origin.anchorPath, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads", "refs/remotes"]),
    defaultBranch(origin.anchorPath),
    services().orca.cli.run(["worktree", "list"], WorktreeListSchema).catch(() => ({ worktrees: [] })),
  ]);
  const names = listed.worktrees
    .filter((worktree) => worktree.repoId === origin.repoId)
    .map((worktree) => `${worktree.displayName} (${worktree.branch?.replace(/^refs\/heads\//, "") ?? "detached"})`);
  const branchList = branches.split("\n").filter((line) => line && !line.endsWith("/HEAD"));

  return [
    `Repo: ${origin.repo}`,
    origin.from
      ? `Opened from worktree ${origin.from.path} on branch ${origin.from.branch ?? "(detached)"} — use that branch as the base and this worktree as the parent unless it is a shared root.`
      : `Opened from the project header — base on the repo default branch (${base ?? "unknown"}) with no parent.`,
    `Repo default branch: ${base ?? "unknown"}`,
    `Existing worktrees: ${names.join(", ") || "none"}`,
    `Branches, most recent first${branchList.length > MAX_BRANCHES ? ` (first ${MAX_BRANCHES})` : ""}: ${branchList.slice(0, MAX_BRANCHES).join(", ")}`,
  ].join("\n");
}
