import "server-only";
import { isMissingPath, type ExecFileFn, type ReportFn } from "@/server/shared/ports";
import type { Project } from "./ProjectRegistry";

export interface GitWorktree {
  path: string;
  branch: string | null;
  isMain: boolean;
}

export function parseWorktreeList(stdout: string): GitWorktree[] {
  return stdout
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter(Boolean))
    .flatMap((lines, index) => {
      const target = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
      const skipped = lines.some((line) => line === "bare" || line.startsWith("prunable"));
      if (!target || skipped) return [];
      const ref = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length) ?? null;
      return [{ path: target, branch: ref ? ref.replace(/^refs\/heads\//, "") : null, isMain: index === 0 }];
    });
}

export async function listWorktrees(execFile: ExecFileFn, project: Project, warn: ReportFn): Promise<GitWorktree[]> {
  if (project.kind === "folder") return [{ path: project.path, branch: null, isMain: true }];
  return execFile("git", ["-C", project.path, "worktree", "list", "--porcelain"], { timeout: 10_000 }).then(
    ({ stdout }) => parseWorktreeList(stdout),
    (error: unknown) => {
      if (!isMissingPath(error)) warn("projects", error, { step: "git worktree list", project: project.path });
      return [];
    },
  );
}
