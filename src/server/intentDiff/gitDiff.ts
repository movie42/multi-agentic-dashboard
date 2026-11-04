import { execFile, spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DiffLine, DiffRange, FileDiff, Hunk } from "@/common/intentDiff/types";
import { parseJson } from "@/server/shared/fallback";

const execFileAsync = promisify(execFile);

const ROOT_CANDIDATES = ["origin/develop", "develop", "origin/main", "main", "origin/master", "master"];
const UNTRACKED_LIMIT_BYTES = 256 * 1024;
const MAX_BUFFER = 64 * 1024 * 1024;

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: MAX_BUFFER,
    timeout: 30_000,
  });
  return stdout;
}

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await git(cwd, args)).trim();
  } catch {
    return null;
  }
}

async function commitTime(cwd: string, rev: string): Promise<number> {
  const seconds = Number(await tryGit(cwd, ["show", "-s", "--format=%ct", rev]));
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

export interface RangeRequest {
  worktreePath: string;
  base: string | null;
  head: string | null;
}

/**
 * Without an explicit base, the diff starts at the newest fork point among the root branches that
 * exist (develop, main, master, local or remote), so an unpushed local main does not pull its
 * commits into the diff. A root branch checked out here is skipped as a candidate.
 */
export async function resolveRange({ worktreePath, base, head }: RangeRequest): Promise<DiffRange> {
  const top = await tryGit(worktreePath, ["rev-parse", "--show-toplevel"]);
  if (!top) throw new Error(`git 저장소가 아니에요: ${worktreePath}`);
  const branch = await tryGit(top, ["branch", "--show-current"]);
  const headSha = head ? await tryGit(top, ["rev-parse", "--verify", `${head}^{commit}`]) : null;
  if (head && !headSha) throw new Error(`커밋을 찾을 수 없어요: ${head}`);
  const tip = headSha ?? "HEAD";

  // eslint-disable-next-line no-restricted-syntax -- unified diff parser state
  let baseSha: string | null = null;
  // eslint-disable-next-line no-restricted-syntax -- unified diff parser state
  let baseLabel = "";
  if (base) {
    baseSha = await tryGit(top, ["rev-parse", "--verify", `${base}^{commit}`]);
    if (!baseSha) throw new Error(`기준 커밋을 찾을 수 없어요: ${base}`);
    baseLabel = base;
  } else {
    // eslint-disable-next-line no-restricted-syntax -- unified diff parser state
    let newest = -1;
    for (const candidate of ROOT_CANDIDATES) {
      if (candidate === branch) continue;
      if (!(await tryGit(top, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]))) continue;
      const forkPoint = await tryGit(top, ["merge-base", tip, candidate]);
      if (!forkPoint) continue;
      const time = await commitTime(top, forkPoint);
      if (time > newest) {
        newest = time;
        baseSha = forkPoint;
        baseLabel = `${candidate} 분기점`;
      }
    }
    if (!baseSha) {
      baseSha = await tryGit(top, ["rev-parse", tip]);
      baseLabel = "HEAD (기준 브랜치 없음)";
    }
  }
  if (!baseSha) throw new Error("비교 기준을 정할 수 없어요");

  return {
    worktreePath: top,
    branch,
    base: baseSha,
    baseLabel,
    head: headSha,
    since: await workStart(top, baseSha, tip, branch),
    until: headSha ? await commitTime(top, headSha) : null,
  };
}

/**
 * When work in this range could have started. The base commit's time is not enough: a rebase moves
 * the base past work done earlier on the branch. The branch's creation (first reflog entry) and the
 * author dates of its commits survive a rebase, so the earliest of the three is used.
 */
async function workStart(top: string, base: string, tip: string, branch: string | null): Promise<number> {
  const times = [await commitTime(top, base)];
  const authored = await tryGit(top, ["log", "--format=%at", `${base}..${tip}`]);
  for (const line of authored?.split("\n") ?? []) {
    const seconds = Number(line);
    if (line && Number.isFinite(seconds)) times.push(seconds * 1000);
  }
  if (branch) {
    const created = await tryGit(top, ["reflog", "show", "--date=unix", "--format=%gd", `refs/heads/${branch}`]);
    const oldest = created?.split("\n").pop()?.match(/@\{(\d+)\}/)?.[1];
    if (oldest) times.push(Number(oldest) * 1000);
  }
  return Math.min(...times.filter((time) => time > 0));
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  const parsed = parseJson(trimmed);
  return typeof parsed === "string" ? parsed : trimmed.slice(1, -1);
}

function stripPrefix(value: string): string {
  const name = unquote(value);
  return name.replace(/^[ab]\//, "");
}

/** Parses `git diff` output produced with `--no-prefix` off and `-M`. */
export function parseUnifiedDiff(output: string): FileDiff[] {
  const files: FileDiff[] = [];
  /* eslint-disable no-restricted-syntax -- unified diff parser state */
  let current: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  /* eslint-enable no-restricted-syntax */

  const finishFile = () => {
    if (current) files.push(current);
    current = null;
    hunk = null;
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      const match = line.match(/^diff --git (?:"?a\/)(.+?)"? (?:"?b\/)(.+?)"?$/);
      const file = match?.[2] ?? line.slice("diff --git ".length);
      current = { file, oldFile: null, change: "modified", binary: false, hunks: [] };
      continue;
    }
    if (!current) continue;
    const file: FileDiff = current;
    if (!hunk) {
      if (line.startsWith("new file mode")) file.change = "added";
      else if (line.startsWith("deleted file mode")) file.change = "deleted";
      else if (line.startsWith("rename from ")) {
        file.change = "renamed";
        file.oldFile = unquote(line.slice("rename from ".length));
      } else if (line.startsWith("rename to ")) file.file = unquote(line.slice("rename to ".length));
      else if (line.startsWith("Binary files ")) file.binary = true;
      else if (line.startsWith("+++ ") && !line.endsWith("/dev/null")) file.file = stripPrefix(line.slice(4));
      else if (line.startsWith("--- ") && !line.endsWith("/dev/null") && file.change === "deleted") {
        file.file = stripPrefix(line.slice(4));
      }
    }
    const header = line.match(HUNK_HEADER);
    if (header) {
      oldNo = Number(header[1]);
      newNo = Number(header[2]);
      hunk = {
        id: `${file.file}#${file.hunks.length}`,
        file: file.file,
        header: (header[3] ?? "").trim(),
        oldStart: oldNo,
        newStart: newNo,
        lines: [],
      };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const active: Hunk = hunk;
    const mark = line[0];
    const text = line.slice(1);
    // eslint-disable-next-line no-restricted-syntax -- unified diff parser state
    let entry: DiffLine | null = null;
    if (mark === "+") entry = { kind: "add", text, oldNo: null, newNo: newNo++ };
    else if (mark === "-") entry = { kind: "del", text, oldNo: oldNo++, newNo: null };
    else if (mark === " ") entry = { kind: "ctx", text, oldNo: oldNo++, newNo: newNo++ };
    if (entry) active.lines.push(entry);
  }
  finishFile();
  return files;
}

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

async function untrackedFiles(top: string): Promise<FileDiff[]> {
  const listed = await tryGit(top, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!listed) return [];
  const names = listed.split("\0").filter(Boolean);
  const diffs = await Promise.all(
    names.map(async (file): Promise<FileDiff | null> => {
      const full = path.join(top, file);
      const info = await stat(full).catch(() => null);
      if (!info?.isFile()) return null;
      if (info.size > UNTRACKED_LIMIT_BYTES) return { file, oldFile: null, change: "added", binary: true, hunks: [] };
      const buffer = await readFile(full);
      if (looksBinary(buffer)) return { file, oldFile: null, change: "added", binary: true, hunks: [] };
      const text = buffer.toString("utf8");
      const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
      return {
        file,
        oldFile: null,
        change: "added",
        binary: false,
        hunks: [
          {
            id: `${file}#0`,
            file,
            header: "",
            oldStart: 0,
            newStart: 1,
            lines: lines.map((line, index) => ({ kind: "add", text: line, oldNo: null, newNo: index + 1 })),
          },
        ],
      };
    }),
  );
  return diffs.filter((diff): diff is FileDiff => diff !== null);
}

export async function loadFileDiffs(range: DiffRange): Promise<FileDiff[]> {
  const args = ["diff", "-M", "--no-color", "--no-ext-diff", "-U3", range.base];
  if (range.head) args.push(range.head);
  const tracked = parseUnifiedDiff(await git(range.worktreePath, args));
  if (range.head) return tracked;
  return [...tracked, ...(await untrackedFiles(range.worktreePath))];
}

/**
 * Reads many `rev:path` blobs through one `git cat-file --batch` process. Spawning one `git show`
 * per file is slow when a diff has dozens of files.
 */
export function readBlobs(cwd: string, specs: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(specs)];
  return new Promise((resolve) => {
    const result = new Map<string, string | null>(unique.map((spec) => [spec, null]));
    if (unique.length === 0) return resolve(result);
    const child = spawn("git", ["-C", cwd, "cat-file", "--batch"], { stdio: ["pipe", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", () => resolve(result));
    child.on("close", () => {
      const output = Buffer.concat(chunks);
      // eslint-disable-next-line no-restricted-syntax -- unified diff parser state
      let offset = 0;
      for (const spec of unique) {
        const newline = output.indexOf(10, offset);
        if (newline < 0) break;
        const header = output.subarray(offset, newline).toString("utf8");
        offset = newline + 1;
        const size = header.match(/^[0-9a-f]+ blob (\d+)$/)?.[1];
        if (!size) continue;
        result.set(spec, output.subarray(offset, offset + Number(size)).toString("utf8"));
        offset += Number(size) + 1;
      }
      resolve(result);
    });
    child.stdin.end(unique.map((spec) => `${spec}\n`).join(""));
  });
}

/** File contents at the diff's end: the working tree, or the head commit. */
export async function readEndFile(range: DiffRange, file: string): Promise<string | null> {
  if (!range.head) return readFile(path.join(range.worktreePath, file), "utf8").catch(() => null);
  return git(range.worktreePath, ["show", `${range.head}:${file}`]).catch(() => null);
}
