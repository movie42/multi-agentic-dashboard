import "server-only";
import { LRUCache } from "lru-cache";
import type { FeatureCheck } from "@/common/workflow/types";
import type { ExecFileFn, ReportFn } from "@/server/shared/ports";
import { findOverlaps, outputLines, overlapCandidates, type CheckInput } from "./featureCheck";

export interface FeatureCheckRunnerOptions {
  execFile: ExecFileFn;
  warn: ReportFn;
  error: ReportFn;
  now?: () => number;
}

export class FeatureCheckRunner {
  private readonly checks = new LRUCache<string, FeatureCheck>({ max: 200 });
  private readonly now: () => number;

  constructor(private readonly options: FeatureCheckRunnerOptions) {
    this.now = options.now ?? Date.now;
  }

  get(featureId: string): FeatureCheck {
    return this.checks.get(featureId) ?? { kind: "idle" };
  }

  start(input: CheckInput): Promise<void> {
    if (this.checks.get(input.featureId)?.kind === "running") return Promise.resolve();
    this.checks.set(input.featureId, { kind: "running", startedAt: this.now() });
    return this.run(input).then(
      (result) => {
        this.checks.set(input.featureId, result);
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.options.error("feature-check", error, { featureId: input.featureId });
        this.checks.set(input.featureId, { kind: "failed", at: this.now(), error: message });
      },
    );
  }

  private async git(cwd: string, args: string[], timeout = 15_000): Promise<string> {
    const { stdout } = await this.options.execFile("git", ["-C", cwd, ...args], {
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }

  private async changedFiles(worktreePath: string, rootRef: string): Promise<Set<string>> {
    const base = (await this.git(worktreePath, ["merge-base", rootRef, "HEAD"])).trim();
    const [tracked, untracked] = await Promise.all([
      this.git(worktreePath, ["diff", "--name-only", base]),
      this.git(worktreePath, ["ls-files", "--others", "--exclude-standard"]),
    ]);
    return new Set([...outputLines(tracked), ...outputLines(untracked)]);
  }

  private async behindCount(worktreePath: string, rootRef: string): Promise<number> {
    return Number((await this.git(worktreePath, ["rev-list", "--count", `HEAD..${rootRef}`])).trim()) || 0;
  }

  private async run(input: CheckInput): Promise<FeatureCheck> {
    const rootRef = `origin/${input.root}`;
    await this.git(input.repoPath, ["fetch", "origin", input.root], 60_000);

    const behind = (
      await Promise.all(
        input.featureWorktrees.map(async (worktree) => ({
          worktree: worktree.name,
          commits: await this.behindCount(worktree.path, rootRef),
        })),
      )
    ).filter((entry) => entry.commits > 0);

    const candidates = overlapCandidates(input);
    const changed = await Promise.all(
      candidates.map((worktree) =>
        this.changedFiles(worktree.path, rootRef).then(
          (files): [string, Set<string>][] => [[worktree.path, files]],
          (error: unknown): [string, Set<string>][] => {
            this.options.warn("feature-check", error, { step: "changed files", worktree: worktree.path });
            return [];
          },
        ),
      ),
    );
    const files = new Map(changed.flat());

    return {
      kind: "done",
      at: this.now(),
      root: input.root,
      behind,
      overlaps: findOverlaps(input.featureWorktrees, candidates, files),
    };
  }
}
