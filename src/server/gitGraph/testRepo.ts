import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestRepo {
  dir: string;
  git: (...args: string[]) => string;
  commit: (file: string, message: string) => string;
  cleanup: () => void;
}

/** A throwaway repository with a fixed identity, for tests that run real git. */
export function createTestRepo(): TestRepo {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "git-graph-")));
  const dir = path.join(root, "main");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "Tester", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "Tester", GIT_COMMITTER_EMAIL: "t@example.com" },
    }).trim();
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  const commit = (file: string, message: string) => {
    writeFileSync(path.join(dir, file), `${message}\n`);
    git("add", file);
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  return { dir, git, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
