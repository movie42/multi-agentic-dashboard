import { attribute, mergeSnapshots } from "@/server/intentDiff/attribute";
import { mergeArchive } from "@/server/intentDiff/archive";
import { buildFlows } from "@/server/intentDiff/flow";
import { git, loadFileDiffs, resolveRange } from "@/server/intentDiff/gitDiff";
import { buildFeatureMap } from "@/server/intentDiff/featureMap";
import { importGraph, readingRanks } from "@/server/intentDiff/order";
import { completionTimes, loadPlan } from "@/server/intentDiff/plan";
import { indexSymbols } from "@/server/intentDiff/symbols";
import type { Highlighter } from "@/server/intentDiff/Highlighter";
import type { SnapshotLog } from "@/server/intentDiff/SnapshotLog";
import type { TranscriptLoader } from "@/server/intentDiff/TranscriptLoader";
import type { FileDiff, IntentDiffResult } from "@/common/intentDiff/types";

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

export interface IntentDiffDeps {
  highlighter: Highlighter;
  snapshotLog: SnapshotLog;
  transcriptLoader: TranscriptLoader;
}

export async function buildIntentDiff(request: IntentDiffRequest, deps: IntentDiffDeps): Promise<IntentDiffResult> {
  const range = await resolveRange(request);
  // Sessions in sibling checkouts write here too (a coordinator setting up worktrees), and a
  // finished commit range may hold work done in a sibling before it was merged.
  const worktrees = await worktreesOf(range.worktreePath);
  const roots = range.head ? worktrees : [range.worktreePath];
  const [files, transcript, steps, plan] = await Promise.all([
    loadFileDiffs(range).then(withPlaceholders),
    deps.transcriptLoader.load(roots, worktrees, range.since, range.until),
    deps.snapshotLog.loadSteps(roots, range.since, range.until),
    loadPlan(range.worktreePath, range.branch, request.task),
  ]);
  const archived = await mergeArchive(
    range,
    transcript.events,
    (events) => mergeSnapshots(events, steps),
    plan?.taskFile ?? null,
    (events) => (plan ? completionTimes(plan, steps, events, (worktree, tree, file) => deps.snapshotLog.readAtTree(worktree, tree, file)) : Promise.resolve(new Map<string, number>())),
  );
  const { events, completions } = archived;

  const texts = await deps.highlighter.diffs(range, files);
  const contents = new Map<string, string>();
  for (const file of files) {
    const text = texts.get(file.file);
    if (text && SOURCE.test(file.file)) contents.set(file.file, text.lines.join("\n"));
  }

  const graph = importGraph(contents);
  const ranks = readingRanks(graph);
  const result = attribute(files, events, plan, completions, ranks);
  const featureMap = buildFeatureMap(files, graph, ranks, result, plan);
  const flow = buildFlows(files, texts, indexSymbols(files, texts), result, ranks);
  const placed = [
    ...result.groups,
    ...result.unplanned,
    ...(result.plan?.phases.flatMap((phase) => phase.items.flatMap((item) => item.groups)) ?? []),
  ].flatMap((group) => group.hunks);

  return {
    range,
    sessionCount: transcript.sessionCount,
    snapshotCount: steps.length,
    archivedCount: archived.restored,
    files,
    ...result,
    featureMap,
    flow,
    stats: {
      hunks: files.reduce((sum, file) => sum + file.hunks.length, 0),
      exact: placed.filter((hunk) => hunk.precision === "exact").length,
      file: placed.filter((hunk) => hunk.precision === "file").length,
      none: result.unknown.length,
      mechanical: result.mechanical.length,
    },
  };
}
