import { attribute, mergeSnapshots } from "./attribute";
import { git, loadFileDiffs, readEndFile, resolveRange } from "./gitDiff";
import { buildFeatureMap } from "./featureMap";
import { importGraph, readingRanks } from "./order";
import { completionTimes, loadPlan } from "./plan";
import { loadSnapshotSteps } from "./snapshots";
import { loadToolEvents } from "./transcripts";
import type { FileDiff, IntentDiffResult } from "./types";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export interface IntentDiffRequest {
  worktreePath: string;
  base: string | null;
  head: string | null;
  task: string | null;
}

async function worktreesOf(worktreePath: string): Promise<string[]> {
  const output = await git(worktreePath, ["worktree", "list", "--porcelain"]).catch(() => "");
  const paths = output
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  return paths.length > 0 ? paths : [worktreePath];
}

/** Every file gets at least one hunk so rename-only and binary changes can be placed too. */
function withPlaceholders(files: FileDiff[]): FileDiff[] {
  return files.map((file) =>
    file.hunks.length > 0
      ? file
      : { ...file, hunks: [{ id: `${file.file}#0`, file: file.file, header: "", oldStart: 0, newStart: 0, lines: [] }] },
  );
}

export async function buildIntentDiff(request: IntentDiffRequest): Promise<IntentDiffResult> {
  const range = await resolveRange(request);
  // Sessions in sibling checkouts write here too (a coordinator setting up worktrees), and a
  // finished commit range may hold work done in a sibling before it was merged.
  const worktrees = await worktreesOf(range.worktreePath);
  const roots = range.head ? worktrees : [range.worktreePath];
  const [files, transcript, steps, plan] = await Promise.all([
    loadFileDiffs(range).then(withPlaceholders),
    loadToolEvents(roots, worktrees, range.since, range.until),
    loadSnapshotSteps(roots, range.since, range.until),
    loadPlan(range.worktreePath, range.branch, request.task),
  ]);
  const events = mergeSnapshots(transcript.events, steps);
  const completions = plan ? await completionTimes(plan, steps, events) : new Map<string, number>();

  const sources = files.filter((file) => SOURCE.test(file.file) && file.change !== "deleted");
  const contents = new Map<string, string>();
  await Promise.all(
    sources.map(async (file) => {
      const text = await readEndFile(range, file.file);
      if (text !== null) contents.set(file.file, text);
    }),
  );

  const graph = importGraph(contents);
  const ranks = readingRanks(graph);
  const result = attribute(files, events, plan, completions, ranks);
  const featureMap = buildFeatureMap(files, graph, ranks, result, plan);
  const placed = [
    ...result.groups,
    ...result.unplanned,
    ...(result.plan?.phases.flatMap((phase) => phase.items.flatMap((item) => item.groups)) ?? []),
  ].flatMap((group) => group.hunks);

  return {
    range,
    sessionCount: transcript.sessionCount,
    snapshotCount: steps.length,
    files,
    ...result,
    featureMap,
    stats: {
      hunks: files.reduce((sum, file) => sum + file.hunks.length, 0),
      exact: placed.filter((hunk) => hunk.precision === "exact").length,
      file: placed.filter((hunk) => hunk.precision === "file").length,
      none: result.unknown.length,
      mechanical: result.mechanical.length,
    },
  };
}
