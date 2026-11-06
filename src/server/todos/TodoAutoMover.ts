import "server-only";
import type { AgentState, BoardSnapshot } from "@/common/orca/types";
import { autoMoveTarget } from "@/common/todos/autoMove";
import { moveCard } from "@/common/todos/board";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import type { TodoStore } from "./TodoStore";

export const PENDING_LAUNCH_TTL_MS = 5 * 60 * 1000;

interface SeenSession {
  state: AgentState;
  firstSeenAt: number;
}

export interface SnapshotEvents {
  startedSessions: ReadonlySet<string>;
  openedPrWorktrees: ReadonlySet<string>;
}

interface AutoInput {
  snapshot: BoardSnapshot;
  events: SnapshotEvents;
  firstSeenAt: (sessionId: string) => number | undefined;
}

/**
 * Watches board snapshots for two events — an attached session starting work and a PR opening —
 * and moves the card once per event. The first snapshot after start only seeds memory, so a session
 * that was already working or a PR that was already open is not mistaken for a new event.
 */
export class TodoAutoMover {
  private readonly sessions = new Map<string, SeenSession>();
  private readonly openPrs = new Map<string, boolean>();
  private primed = false;

  constructor(private readonly store: Pick<TodoStore, "transact">) {}

  async observe(snapshot: BoardSnapshot): Promise<void> {
    const events = this.diff(snapshot);
    if (!events) return;
    await this.store.transact((board) => ({
      board: applyAutoEvents(board, { snapshot, events, firstSeenAt: (id) => this.sessions.get(id)?.firstSeenAt }),
    }));
  }

  private diff(snapshot: BoardSnapshot): SnapshotEvents | null {
    const firstPass = !this.primed;
    this.primed = true;
    const startedSessions = new Set<string>();
    const openedPrWorktrees = new Set<string>();

    snapshot.agents.forEach((agent) => {
      const sessionId = agent.session?.id;
      if (!sessionId) return;
      const seen = this.sessions.get(sessionId);
      if (!firstPass && agent.state === "working" && seen?.state !== "working") startedSessions.add(sessionId);
      this.sessions.set(sessionId, { state: agent.state, firstSeenAt: seen?.firstSeenAt ?? (firstPass ? 0 : snapshot.fetchedAt) });
    });

    snapshot.worktrees.forEach((worktree) => {
      const pr = worktree.pullRequest;
      if (pr.kind !== "found" && pr.kind !== "none") return;
      const open = pr.kind === "found" && pr.state === "OPEN";
      const before = this.openPrs.get(worktree.path);
      if (!firstPass && open && before === false) openedPrWorktrees.add(worktree.path);
      this.openPrs.set(worktree.path, open);
    });

    return firstPass ? null : { startedSessions, openedPrWorktrees };
  }
}

export function applyAutoEvents(board: TodoBoard, { snapshot, events, firstSeenAt }: AutoInput): TodoBoard {
  const now = snapshot.fetchedAt;
  const attached = attachPendingLaunches(board, snapshot, firstSeenAt);
  return attached.cards.reduce((acc, card) => {
    const worktrees = new Set([
      ...(card.worktreePath ? [card.worktreePath] : []),
      ...snapshot.agents.filter((agent) => agent.session && card.sessionIds.includes(agent.session.id)).map((agent) => agent.worktreePath),
    ]);
    const started = card.sessionIds.some((id) => events.startedSessions.has(id));
    const opened = [...worktrees].some((path) => events.openedPrWorktrees.has(path));
    const afterStart = started ? moveTo(acc, card.id, "session-started", now) : acc;
    return opened ? moveTo(afterStart, card.id, "pr-opened", now) : afterStart;
  }, attached);
}

function moveTo(board: TodoBoard, cardId: string, event: "session-started" | "pr-opened", now: number): TodoBoard {
  const card = board.cards.find((each) => each.id === cardId);
  const target = card ? autoMoveTarget(board, card, event) : null;
  return target ? moveCard(board, cardId, target, now, true) : board;
}

function attachPendingLaunches(board: TodoBoard, snapshot: BoardSnapshot, firstSeenAt: AutoInput["firstSeenAt"]): TodoBoard {
  if (!board.cards.some((card) => card.pendingLaunch)) return board;
  const now = snapshot.fetchedAt;
  const taken = new Set(board.cards.flatMap((card) => card.sessionIds));
  const cards = board.cards.map((card): TodoCard => {
    const pending = card.pendingLaunch;
    if (!pending) return card;
    const found = snapshot.agents.find((agent) => {
      const id = agent.session?.id;
      return id && agent.worktreePath === pending.worktreePath && !taken.has(id) && (firstSeenAt(id) ?? -1) >= pending.at;
    })?.session?.id;
    if (found) {
      taken.add(found);
      return { ...card, sessionIds: [...card.sessionIds, found], pendingLaunch: null, updatedAt: now };
    }
    return now - pending.at > PENDING_LAUNCH_TTL_MS ? { ...card, pendingLaunch: null, updatedAt: now } : card;
  });
  return cards.every((card, index) => card === board.cards[index]) ? board : { ...board, cards };
}
