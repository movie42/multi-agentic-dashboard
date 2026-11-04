export type DiffLineKind = "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface Hunk {
  id: string;
  file: string;
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export type FileChange = "modified" | "added" | "deleted" | "renamed";

export interface FileDiff {
  file: string;
  oldFile: string | null;
  change: FileChange;
  binary: boolean;
  hunks: Hunk[];
}

export interface DiffRange {
  worktreePath: string;
  branch: string | null;
  /** Commit the diff starts from (full SHA). */
  base: string;
  /** How the base was chosen, e.g. "origin/main 분기점" or the ref the caller passed. */
  baseLabel: string;
  /** Commit the diff ends at; null means the working tree, uncommitted and untracked files included. */
  head: string | null;
  since: number;
  until: number | null;
}

/** exact: the changed lines were recorded; file: only the touched file is known. */
export type ChangePrecision = "exact" | "file";

export interface LineChange {
  added: string[];
  removed: string[];
  precision: ChangePrecision;
}

export interface ToolEvent {
  id: string;
  sessionId: string;
  at: number;
  tool: string;
  /** The `description` an agent gives a shell command. */
  description: string | null;
  /** The text the agent wrote right before this call in the same turn. */
  narration: string | null;
  segmentId: string;
  prompt: string | null;
  todo: string | null;
  /** Shell command text, kept to find the files it mentions. */
  command: string | null;
  /** Edited text or command, kept to find plan items marked done by this call. */
  inputText: string;
  /** Repo-relative path → lines this call changed. */
  changes: Record<string, LineChange>;
}

export type HunkPrecision = ChangePrecision | "none";

export interface HunkRef {
  hunkId: string;
  precision: HunkPrecision;
}

export type IntentSource = "todo" | "narration" | "prompt";

export interface IntentGroup {
  id: string;
  title: string;
  source: IntentSource;
  notes: string[];
  sessionId: string;
  startedAt: number;
  hunks: HunkRef[];
  /** Files in this group that the plan item does not list. */
  outsidePlanFiles: string[];
}

export interface PlanItemView {
  id: string;
  title: string;
  done: boolean;
  files: string[];
  completedAt: number | null;
  groups: IntentGroup[];
}

export interface PlanPhaseView {
  id: string;
  title: string;
  items: PlanItemView[];
}

export interface PlanView {
  taskKey: string;
  title: string;
  phases: PlanPhaseView[];
}

export type MechanicalReason = "whitespace" | "imports" | "rename" | "lockfile" | "taskDoc";

export interface MechanicalRef {
  file: string;
  hunkId: string;
  reason: MechanicalReason;
}

export interface MissingItem {
  id: string;
  title: string;
  done: boolean;
  /** Another item that holds the changes to this item's files. */
  sharedWith: string | null;
}

export type OwnerKind = "item" | "intent" | "unplanned" | "mechanical" | "unknown";

/** What a file's changes were made for: a plan item, an intent group, or a bucket. */
export interface FileOwner {
  kind: OwnerKind;
  id: string;
  label: string;
}

export interface FeatureFile {
  file: string;
  /** Changed files this file imports. */
  imports: string[];
  /** Changed files that import this file. */
  importedBy: string[];
  hunkIds: string[];
  owners: FileOwner[];
  added: number;
  removed: number;
}

export interface FeatureCluster {
  id: string;
  title: string;
  /** Files no other changed file imports — where reading a feature starts. */
  entries: string[];
  files: string[];
  /** Plan phases touching the cluster, most changes first. */
  phases: string[];
}

export interface FeatureMap {
  files: Record<string, FeatureFile>;
  clusters: FeatureCluster[];
  /** Changed files with no import link to another changed file. */
  loose: string[];
}

export interface IntentDiffResult {
  range: DiffRange;
  sessionCount: number;
  snapshotCount: number;
  files: FileDiff[];
  plan: PlanView | null;
  /** Intent groups when there is no plan; empty when a plan holds them. */
  groups: IntentGroup[];
  unplanned: IntentGroup[];
  missing: MissingItem[];
  mechanical: MechanicalRef[];
  unknown: HunkRef[];
  featureMap: FeatureMap;
  stats: { hunks: number; exact: number; file: number; none: number; mechanical: number };
}

export type IntentDiffResponse = { ok: true; result: IntentDiffResult } | { ok: false; error: string };
