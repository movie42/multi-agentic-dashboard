import path from "node:path";
import { matchesHint, type LoadedPlan, type PlanItem } from "@/server/intentDiff/plan";
import { compareFiles } from "@/server/intentDiff/order";
import type { SnapshotStep } from "@/server/intentDiff/SnapshotLog";
import type {
  FileDiff,
  Hunk,
  HunkPrecision,
  HunkRef,
  IntentGroup,
  IntentSource,
  MechanicalReason,
  MechanicalRef,
  MissingItem,
  PlanView,
  ToolEvent,
} from "@/common/intentDiff/types";

const LOCKFILES: ReadonlySet<string> = new Set(["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const TASK_DOC = /^docs\/[^/]+\/tasks\/[^/]+\.json$/;
const IMPORT_LINE = /^\s*(import\b.*|export\s.*\bfrom\s+["'].*|\}\s*from\s+["'].*|[A-Za-z_$][\w$]*(\s+as\s+[\w$]+)?,?|type\s+[A-Za-z_$][\w$]*,?)\s*;?\s*$/;
const SHELL_WRITES = /sed\s+-i|perl\s+-p?i|(^|[^0-9&<>=-])>>?\s*(?!\/dev\/null)[^\s&|>]|\btee\b|cat\s*>|open\([^)]*,\s*["'][wa]|write_text\(|writeFileSync\(|writeFile\(|\bmv\s|\bcp\s|\brm\s|git\s+(mv|rm|checkout|restore|apply)\b|\bpatch\s/;
const TITLE_LIMIT = 90;

// ── Snapshots ───────────────────────────────────────────────────────────

/**
 * A recorded snapshot replaces what the transcript knew about the same tool call, because it holds
 * the lines the call really changed, shell commands included. A snapshot with no matching call
 * becomes its own event.
 */
export function mergeSnapshots(events: ToolEvent[], steps: SnapshotStep[]): ToolEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const merged = [...events];
  for (const step of steps) {
    const { record } = step;
    const event =
      (record.toolUseId ? byId.get(record.toolUseId) : undefined) ??
      (record.sessionId
        ? [...events]
            .reverse()
            .find((candidate) => candidate.sessionId === record.sessionId && candidate.at <= record.at && candidate.tool === record.tool)
        : undefined);
    if (event) {
      event.changes = step.changes;
      continue;
    }
    merged.push({
      id: `snapshot:${record.at}`,
      sessionId: record.sessionId ?? "",
      at: record.at,
      tool: record.tool,
      description: null,
      narration: null,
      segmentId: `snapshot:${record.sessionId ?? "unknown"}`,
      prompt: null,
      todo: null,
      command: null,
      inputText: "",
      changes: step.changes,
    });
  }
  return merged.sort((a, b) => a.at - b.at);
}

// ── Mechanical changes ──────────────────────────────────────────────────

function changedLines(hunk: Hunk): { added: string[]; removed: string[] } {
  return {
    added: hunk.lines.filter((line) => line.kind === "add").map((line) => line.text),
    removed: hunk.lines.filter((line) => line.kind === "del").map((line) => line.text),
  };
}

function mechanicalReason(file: FileDiff, hunk: Hunk, taskFile: string | null): MechanicalReason | null {
  if (LOCKFILES.has(path.posix.basename(file.file))) return "lockfile";
  if (file.file === taskFile || TASK_DOC.test(file.file)) return "taskDoc";
  if (hunk.lines.length === 0) return file.change === "renamed" ? "rename" : null;
  const { added, removed } = changedLines(hunk);
  const squash = (lines: string[]) => lines.join("").replace(/\s+/g, "");
  if (added.length + removed.length > 0 && squash(added) === squash(removed)) return "whitespace";
  const changed = [...added, ...removed].filter((line) => line.trim() !== "");
  if (
    changed.length > 0 &&
    changed.some((line) => /^\s*(import\b|export\s.*\bfrom\b|\}\s*from\b)/.test(line)) &&
    changed.every((line) => IMPORT_LINE.test(line))
  ) {
    return "imports";
  }
  return null;
}

// ── Hunk → tool call ────────────────────────────────────────────────────

function normalize(line: string): string {
  return line.trim();
}

function significant(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 4 && /[\p{L}\p{N}]/u.test(trimmed);
}

interface Owner {
  event: ToolEvent;
  precision: Exclude<HunkPrecision, "none">;
}

function shellMentions(events: ToolEvent[], files: FileDiff[]): Map<string, ToolEvent[]> {
  const basenameCount = new Map<string, number>();
  for (const file of files) {
    const base = path.posix.basename(file.file);
    basenameCount.set(base, (basenameCount.get(base) ?? 0) + 1);
  }
  const byFile = new Map<string, ToolEvent[]>();
  for (const event of events) {
    const command = event.command;
    if (!command || Object.keys(event.changes).length > 0 || !SHELL_WRITES.test(command)) continue;
    for (const file of files) {
      const base = path.posix.basename(file.file);
      const mentioned =
        command.includes(file.file) || (basenameCount.get(base) === 1 && new RegExp(`[/\\s'"]${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(command));
      if (!mentioned) continue;
      byFile.set(file.file, [...(byFile.get(file.file) ?? []), event]);
    }
  }
  return byFile;
}

function findOwner(hunk: Hunk, events: ToolEvent[], mentions: Map<string, ToolEvent[]>): Owner | null {
  const { added, removed } = changedLines(hunk);
  const pick = (lines: string[]) => lines.filter(significant).map(normalize);
  const fromAdded = pick(added);
  const fromRemoved = pick(removed);
  const [needles, side]: [string[], "added" | "removed"] =
    fromAdded.length > 0
      ? [fromAdded, "added"]
      : fromRemoved.length > 0
        ? [fromRemoved, "removed"]
        : [added.map(normalize).filter(Boolean), "added"];

  const touching = events.filter((event) => event.changes[hunk.file]);
  if (needles.length > 0 && touching.length > 0) {
    const sets = touching.map((event) => ({ event, lines: new Set(event.changes[hunk.file][side].map(normalize)) }));
    const votes = new Map<ToolEvent, number>();
    for (const needle of needles) {
      const writer = [...sets].reverse().find((entry) => entry.lines.has(needle));
      if (writer) votes.set(writer.event, (votes.get(writer.event) ?? 0) + 1);
    }
    const best =
      [...votes].reduce<[ToolEvent, number] | null>(
        (top, entry) => (!top || entry[1] > top[1] || (entry[1] === top[1] && entry[0].at > top[0].at) ? entry : top),
        null,
      )?.[0] ?? null;
    if (best) {
      const precision = best.changes[hunk.file].precision;
      return { event: best, precision };
    }
  }

  const fileLevel = [...touching, ...(mentions.get(hunk.file) ?? [])].sort((a, b) => a.at - b.at);
  const latest = fileLevel[fileLevel.length - 1];
  return latest ? { event: latest, precision: "file" } : null;
}

// ── Tool call → intent ──────────────────────────────────────────────────

function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim()) ?? "";
  const sentence = line.split(/(?<=[.!?。])\s/)[0] ?? line;
  const clean = sentence.replace(/[*`#>]/g, "").trim();
  return clean.length > TITLE_LIMIT ? `${clean.slice(0, TITLE_LIMIT - 1)}…` : clean;
}

function intentKey(event: ToolEvent): string {
  return event.todo ? `todo:${event.sessionId}:${event.todo}` : event.segmentId;
}

function sourceOf(event: ToolEvent): IntentSource {
  if (event.todo) return "todo";
  return event.narration ? "narration" : "prompt";
}

function titleOf(event: ToolEvent): string {
  if (event.todo) return firstLine(event.todo);
  if (event.narration) return firstLine(event.narration);
  if (event.prompt) return firstLine(event.prompt);
  if (event.description) return firstLine(event.description);
  return "세션 기록 없이 찍힌 변경";
}

class GroupBuilder {
  private groups = new Map<string, IntentGroup & { events: Set<ToolEvent> }>();

  private create(key: string, event: ToolEvent): IntentGroup & { events: Set<ToolEvent> } {
    const group = {
      id: key,
      title: titleOf(event),
      source: sourceOf(event),
      notes: [],
      sessionId: event.sessionId,
      startedAt: event.at,
      hunks: [],
      outsidePlanFiles: [],
      events: new Set<ToolEvent>(),
    };
    this.groups.set(key, group);
    return group;
  }

  add(key: string, owner: Owner, hunk: Hunk): IntentGroup {
    const { event } = owner;
    const group = this.groups.get(key) ?? this.create(key, event);
    if (!group.events.has(event)) {
      group.events.add(event);
      group.startedAt = Math.min(group.startedAt, event.at);
      const notes = [event.narration, event.description, event.todo ? event.prompt : null];
      for (const note of notes) {
        if (note && !group.notes.includes(note) && firstLine(note) !== group.title) group.notes.push(note);
      }
    }
    group.hunks.push({ hunkId: hunk.id, precision: owner.precision });
    return group;
  }

  list(): IntentGroup[] {
    return [...this.groups.values()]
      .map((group) => ({
        id: group.id,
        title: group.title,
        source: group.source,
        notes: group.notes,
        sessionId: group.sessionId,
        startedAt: group.startedAt,
        hunks: group.hunks,
        outsidePlanFiles: group.outsidePlanFiles,
      }))
      .sort((a, b) => a.startedAt - b.startedAt);
  }
}

// ── Plan item ───────────────────────────────────────────────────────────

/**
 * Time decides first: a change belongs to the first item checked off after it. When that item does
 * not list the file but another item does, the timeline is treated as ambiguous and the file list
 * wins. A change that matches neither stays with the timeline's item, flagged as outside its files —
 * unless several items were checked off at that same moment, which leaves no item to pick.
 */
function planItemFor(
  plan: LoadedPlan,
  completions: Map<string, number>,
  at: number,
  file: string,
): { item: PlanItem; outside: boolean } | null {
  const items = plan.phases.flatMap((phase) => phase.items);
  const hinted = (item: PlanItem) => item.files.some((hint) => matchesHint(file, hint));
  const doneAfter = (item: PlanItem) => {
    const time = completions.get(item.id);
    return time !== undefined && time >= at ? time : null;
  };
  const byTime = items
    .filter((item) => doneAfter(item) !== null)
    .sort((a, b) => (doneAfter(a) ?? 0) - (doneAfter(b) ?? 0));
  const firstAt = byTime.length > 0 ? doneAfter(byTime[0]) : null;
  const tied = byTime.filter((item) => doneAfter(item) === firstAt);
  const timeItem = tied.find(hinted) ?? (tied.length === 1 ? tied[0] : null);
  if (timeItem && hinted(timeItem)) return { item: timeItem, outside: false };

  const byHint = items.filter(hinted);
  if (byHint.length > 0) {
    const open = byHint.find((item) => doneAfter(item) !== null || !completions.has(item.id));
    return { item: open ?? byHint[0], outside: false };
  }
  if (timeItem) return { item: timeItem, outside: timeItem.files.length > 0 };
  return null;
}

// ── Assembly ────────────────────────────────────────────────────────────

export interface Attribution {
  plan: PlanView | null;
  groups: IntentGroup[];
  unplanned: IntentGroup[];
  missing: MissingItem[];
  mechanical: MechanicalRef[];
  unknown: HunkRef[];
}

export function attribute(
  files: FileDiff[],
  events: ToolEvent[],
  plan: LoadedPlan | null,
  completions: Map<string, number>,
  ranks: Map<string, number>,
): Attribution {
  const mechanical: MechanicalRef[] = [];
  const unknown: HunkRef[] = [];
  const mentions = shellMentions(events, files);
  const loose = new GroupBuilder();
  const unplanned = new GroupBuilder();
  const perItem = new Map<string, GroupBuilder>();
  const outsideByGroup = new Map<string, Set<string>>();
  const hunkById = new Map<string, Hunk>();

  for (const file of files) {
    for (const hunk of file.hunks) {
      hunkById.set(hunk.id, hunk);
      const reason = mechanicalReason(file, hunk, plan?.taskFile ?? null);
      if (reason) {
        mechanical.push({ file: file.file, hunkId: hunk.id, reason });
        continue;
      }
      const owner = findOwner(hunk, events, mentions);
      if (!owner) {
        unknown.push({ hunkId: hunk.id, precision: "none" });
        continue;
      }
      const key = intentKey(owner.event);
      if (!plan) {
        loose.add(key, owner, hunk);
        continue;
      }
      const placed = planItemFor(plan, completions, owner.event.at, file.file);
      if (!placed) {
        unplanned.add(key, owner, hunk);
        continue;
      }
      const builder = perItem.get(placed.item.id) ?? new GroupBuilder();
      perItem.set(placed.item.id, builder);
      const group = builder.add(`${placed.item.id}|${key}`, owner, hunk);
      if (placed.outside) outsideByGroup.set(group.id, (outsideByGroup.get(group.id) ?? new Set()).add(file.file));
    }
  }

  const sortHunks = (group: IntentGroup): IntentGroup => {
    const hunks = [...group.hunks].sort((a, b) => {
      const left = hunkById.get(a.hunkId);
      const right = hunkById.get(b.hunkId);
      if (!left || !right) return 0;
      return compareFiles(ranks, left.file, right.file) || left.newStart - right.newStart;
    });
    return { ...group, hunks };
  };

  const planView: PlanView | null = plan
    ? {
        taskKey: plan.taskKey,
        title: plan.title,
        phases: plan.phases.map((phase) => ({
          id: phase.id,
          title: phase.title,
          items: phase.items.map((item) => {
            const groups = (perItem.get(item.id)?.list() ?? []).map((group) => {
              const outside = [...(outsideByGroup.get(group.id) ?? [])];
              return sortHunks({ ...group, outsidePlanFiles: outside });
            });
            return { ...item, completedAt: completions.get(item.id) ?? null, groups };
          }),
        })),
      }
    : null;
  const items = planView?.phases.flatMap((phase) => phase.items) ?? [];
  const holderOf = (hints: string[]) =>
    items.find((item) =>
      item.groups.some((group) =>
        group.hunks.some((ref) => {
          const file = hunkById.get(ref.hunkId)?.file;
          return file !== undefined && hints.some((hint) => matchesHint(file, hint));
        }),
      ),
    )?.id ?? null;
  const missing: MissingItem[] = items
    .filter((item) => item.groups.length === 0)
    .map((item) => ({ id: item.id, title: item.title, done: item.done, sharedWith: holderOf(item.files) }));

  return {
    plan: planView,
    groups: loose.list().map(sortHunks),
    unplanned: unplanned.list().map(sortHunks),
    missing,
    mechanical,
    unknown,
  };
}
