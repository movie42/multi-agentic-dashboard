import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { FileChangeStatus, WorkingFile, WorkingTree } from "@/common/gitGraph/types";
import { runGit, tryGit } from "./git";

const CHANGE: ReadonlySet<string> = new Set<FileChangeStatus>(["A", "M", "D", "R", "C", "T"]);
const isChange = (code: string): code is FileChangeStatus => CHANGE.has(code);
const CONFLICT: ReadonlySet<string> = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** `git status --porcelain=v1 -z`: `XY path\0`, and renames/copies add `from\0` after the path. */
export function parseStatus(stdout: string): WorkingFile[] {
  const parts = stdout.split("\0")[Symbol.iterator]();
  const files: WorkingFile[] = [];
  for (const entry of parts) {
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const filePath = entry.slice(3);
    const [x = " ", y = " "] = code;
    const renamed = x === "R" || x === "C";
    const from = renamed ? (parts.next().value ?? null) : null;
    if (code === "??") files.push({ path: filePath, from: null, state: "untracked", status: "?" });
    else if (CONFLICT.has(code)) files.push({ path: filePath, from: null, state: "conflicted", status: "U" });
    else {
      if (isChange(x)) files.push({ path: filePath, from, state: "staged", status: x });
      if (isChange(y)) files.push({ path: filePath, from: null, state: "unstaged", status: y });
    }
  }
  return files;
}

export async function readWorkingTree(worktreePath: string): Promise<WorkingTree> {
  const [status, headSha] = await Promise.all([
    runGit(worktreePath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    tryGit(worktreePath, ["rev-parse", "HEAD"]),
  ]);
  return { headSha: headSha || null, files: parseStatus(status) };
}

/** The file's change against HEAD, staged and unstaged together; an untracked file shows as all added. */
export async function readWorkingDiff(worktreePath: string, file: string): Promise<string> {
  const top = (await runGit(worktreePath, ["rev-parse", "--show-toplevel"])).trim();
  const absolute = path.resolve(top, file);
  if (path.relative(top, absolute).startsWith("..")) throw new Error("워크트리 밖의 파일이에요");
  const tracked = (await tryGit(top, ["ls-files", "--error-unmatch", "--", file])) !== null;
  if (tracked || !existsSync(absolute)) return runGit(top, ["diff", "--no-color", "HEAD", "--", file]);
  // `--no-index` exits 1 whenever the two sides differ, which for a new file is always, so stdout is read either way.
  return new Promise((resolve, reject) => {
    execFile("git", ["-C", top, "diff", "--no-color", "--no-index", "--", "/dev/null", file], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout || !error) resolve(stdout);
      else reject(new Error(stderr.trim() || error.message));
    });
  });
}
