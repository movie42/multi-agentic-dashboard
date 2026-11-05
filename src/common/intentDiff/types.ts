export type DiffLineKind = "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
  /** Syntax-highlighted markup for the line; identifiers carry `data-col` so they can be looked up. */
  html?: string;
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

export type SymbolKind = "component" | "function" | "value" | "type";

/** A changed top-level declaration, read as one step of a flow. */
export interface FlowSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  startLine: number;
  endLine: number;
  owner: FileOwner | null;
  /** Titles of the intents whose changes fall inside this symbol. */
  intents: string[];
  /** The symbol's end-side code with removed lines put back in place. */
  lines: DiffLine[];
}

/** own: read here · foreign: built under another plan item, linked · repeat: already read above. */
export type FlowStepKind = "own" | "foreign" | "repeat";

export interface FlowStep {
  symbolId: string;
  depth: number;
  /** The line in the caller that leads to this step. */
  via: { line: number; text: string } | null;
  kind: FlowStepKind;
}

export interface ItemFlow {
  steps: FlowStep[];
  /** Changed types the item's code uses, read after the flow. */
  types: string[];
  /** Changes outside any declaration: imports, config, JSON, top-level statements. */
  rest: HunkRef[];
}

export interface FlowData {
  symbols: Record<string, FlowSymbol>;
  /** Plan item id, or "unplanned" / "unknown" / "mechanical", or "*" when there is no plan. */
  flows: Record<string, ItemFlow>;
}

export interface IntentDiffResult {
  range: DiffRange;
  sessionCount: number;
  snapshotCount: number;
  /** Tool calls restored from the archive because their transcript or snapshot is gone. */
  archivedCount: number;
  files: FileDiff[];
  plan: PlanView | null;
  /** Intent groups when there is no plan; empty when a plan holds them. */
  groups: IntentGroup[];
  unplanned: IntentGroup[];
  missing: MissingItem[];
  mechanical: MechanicalRef[];
  unknown: HunkRef[];
  featureMap: FeatureMap;
  flow: FlowData;
  stats: { hunks: number; exact: number; file: number; none: number; mechanical: number };
}

export type IntentDiffResponse = { ok: true; result: IntentDiffResult } | { ok: false; error: string };

export interface SymbolLocation {
  /** Repo-relative path, or the package path for a file under node_modules. */
  file: string;
  external: boolean;
  line: number;
  text: string;
  /** `text` as highlighted markup, filled in by the route. */
  html?: string;
  snippet: { startLine: number; lines: string[]; html?: string[] };
}

export interface SymbolLookup {
  name: string;
  /** TypeScript's hover text: the declaration with its type. */
  signature: string | null;
  signatureHtml?: string;
  definitions: SymbolLocation[];
  references: SymbolLocation[];
  truncated: boolean;
}

export type SymbolLookupResponse = { ok: true; lookup: SymbolLookup } | { ok: false; error: string };

/** step: the whole flow step · lines: a range the reader picked by line number (end-side numbers). */
export type AskAnchor =
  | { kind: "step"; symbolId: string; file: string; startLine: number; endLine: number }
  | { kind: "lines"; file: string; startLine: number; endLine: number };

/** writer: a fork of the session that wrote the lines · fresh: a new session with no history. */
export type AskTarget =
  | { kind: "writer"; sessionId: string }
  | { kind: "fresh"; reason: "chosen" | "no-writer" | "writer-gone" };

export interface AskTurn {
  question: string;
  answer: string | null;
  error: string | null;
  askedAt: number;
  answeredAt: number | null;
}

export interface AskConclusion {
  text: string;
  /** The answering session's judgment, which the person may flip. */
  needsChange: boolean;
  draftedAt: number;
  confirmedAt: number | null;
  sentAt: number | null;
}

/** A conversation about some lines, held by its own Claude session so the original stays untouched. */
export interface AskThread {
  id: string;
  worktreePath: string;
  anchor: AskAnchor;
  /** What the lines are, for the header: the symbol name or the file. */
  label: string;
  target: AskTarget;
  /** The session that holds this conversation: the fork, or the fresh session. */
  sessionId: string;
  /** Where the session lives; `claude --resume` only finds a session from its own directory. */
  cwd: string;
  turns: AskTurn[];
  conclusion?: AskConclusion | null;
  createdAt: number;
  updatedAt: number;
}

/** What the page knows about the picked lines, sent with the first question. */
export interface AskContext {
  label: string;
  planItem: { id: string; title: string } | null;
  intents: string[];
  /** The picked lines as a unified diff body (`+`, `-`, ` ` prefixes). */
  diff: string;
}

export interface AskRequest {
  worktreePath: string;
  question: string;
  /** Continue this thread; the fields below are ignored when set. */
  threadId?: string;
  anchor?: AskAnchor;
  context?: AskContext;
  /** The session that last changed the picked lines; null when none is known. */
  writerSessionId?: string | null;
  /** Ask a fresh session even when the writer is known. */
  fresh?: boolean;
}

/** One NDJSON line of the ask stream. */
export type AskEvent =
  | { type: "thread"; thread: AskThread }
  | { type: "text"; text: string }
  | { type: "tool"; label: string }
  | { type: "done"; thread: AskThread }
  | { type: "error"; error: string; thread: AskThread | null };

export type AskThreadsResponse = { ok: true; threads: AskThread[] } | { ok: false; error: string };

export type HighlightResponse = { ok: true; html: string[] } | { ok: false; error: string };
