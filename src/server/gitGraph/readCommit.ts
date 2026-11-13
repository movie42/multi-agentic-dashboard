import { SHA_PATTERN } from "@/common/gitGraph/schema";
import type { CommitDetail, FileChange, FileChangeStatus } from "@/common/gitGraph/types";
import { runGit } from "./git";
import { FIELD } from "./parseLog";

const STATUSES: ReadonlySet<string> = new Set<FileChangeStatus>(["A", "M", "D", "R", "C", "T"]);

const isStatus = (value: string): value is FileChangeStatus => STATUSES.has(value);

/** `--name-status` lines; renames and copies carry a score (`R087`) and two paths. */
export function parseNameStatus(stdout: string): FileChange[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line): FileChange[] => {
      const [code = "", first = "", second] = line.split("\t");
      const status = code.charAt(0);
      if (!isStatus(status)) return [];
      return second === undefined ? [{ status, path: first, from: null }] : [{ status, path: second, from: first }];
    });
}

export async function readCommit(worktreePath: string, sha: string): Promise<CommitDetail> {
  if (!SHA_PATTERN.test(sha)) throw new Error("커밋 SHA 형식이 아니에요");
  const [meta, files] = await Promise.all([
    runGit(worktreePath, ["show", "-s", `--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%B`, sha]),
    runGit(worktreePath, ["show", "--format=", "--name-status", "-M", "--diff-merges=first-parent", sha]),
  ]);
  const [fullSha = sha, parents = "", author = "", email = "", time = "0", ...message] = meta.split(FIELD);
  return {
    sha: fullSha,
    parents: parents.split(" ").filter(Boolean),
    author,
    email,
    time: Number(time) * 1000,
    message: message.join(FIELD).trim(),
    files: parseNameStatus(files),
  };
}

/** One file's patch in a commit; a rename passes its old path too so `-M` can pair them. */
export async function readCommitDiff(worktreePath: string, sha: string, file: string, from: string | null): Promise<string> {
  if (!SHA_PATTERN.test(sha)) throw new Error("커밋 SHA 형식이 아니에요");
  const paths = from ? [from, file] : [file];
  return runGit(worktreePath, ["show", "--format=", "--no-color", "-M", "--diff-merges=first-parent", sha, "--", ...paths]);
}
