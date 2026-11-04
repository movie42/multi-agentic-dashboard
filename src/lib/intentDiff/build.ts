import { attribute, mergeSnapshots } from "./attribute";
import { mergeArchive } from "./archive";
import { buildFlows } from "./flow";
import { git, loadFileDiffs, resolveRange } from "./gitDiff";
import { highlightDiffs } from "./highlight";
import { buildFeatureMap } from "./featureMap";
import { importGraph, readingRanks } from "./order";
import { completionTimes, loadPlan } from "./plan";
import { loadSnapshotSteps } from "./snapshots";
import { indexSymbols } from "./symbols";
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
  const archived = await mergeArchive(
    range,
    transcript.events,
    (events) => mergeSnapshots(events, steps),
    plan?.taskFile ?? null,
    (events) => (plan ? completionTimes(plan, steps, events) : Promise.resolve(new Map<string, number>())),
  );
  const { events, completions } = archived;

  const texts = await highlightDiffs(range, files);
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
