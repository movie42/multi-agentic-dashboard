import "server-only";
import type { BoardSnapshot } from "@/common/orca/types";
import type { TodoBoard, TodoCard } from "@/common/todos/types";
import type { TodoStore } from "./TodoStore";

export const PENDING_LAUNCH_TTL_MS = 5 * 60 * 1000;

/**
 * Attaches the session a card's [새 세션] opened. A session counts only if the dashboard first saw it
 * after the launch; sessions already present in the first snapshot after start are never candidates.
 */
export class TodoLaunchAttacher {
  private readonly firstSeen = new Map<string, number>();
  private primed = false;

  constructor(private readonly store: Pick<TodoStore, "transact">) {}

  async observe(snapshot: BoardSnapshot): Promise<void> {
    const firstPass = !this.primed;
    this.primed = true;
    snapshot.agents.forEach((agent) => {
      const id = agent.session?.id;
      if (id && !this.firstSeen.has(id)) this.firstSeen.set(id, firstPass ? 0 : snapshot.fetchedAt);
    });
    if (firstPass) return;
    await this.store.transact((board) => ({ board: attachPendingLaunches(board, snapshot, (id) => this.firstSeen.get(id)) }));
  }
}

export function attachPendingLaunches(
  board: TodoBoard,
  snapshot: BoardSnapshot,
  firstSeenAt: (sessionId: string) => number | undefined,
): TodoBoard {
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
