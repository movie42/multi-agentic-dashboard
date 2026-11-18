import type { TodoBoard, TodoCard } from "./types";

export const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;

/** What auto-linking needs to know about a session, open or past. */
export interface LinkableSession {
  id: string;
  cwd: string | null;
  branch: string | null;
  /** Headless runs (the to-do agent, diff questions) are never attached. */
  headless: boolean;
}

/** What auto-linking needs to know about a worktree on the dashboard. */
export interface LinkableWorktree {
  path: string;
  repo: string;
  name: string;
  branch: string | null;
  isMain: boolean;
}

function keyPattern(key: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9])${key.replace(/[^A-Za-z0-9-]/g, "")}(?![0-9])`, "i");
}

export function mentionsKey(text: string | null, keys: readonly string[]): boolean {
  if (!text) return false;
  return keys.some((key) => keyPattern(key).test(text));
}

function inside(cwd: string | null, dir: string): boolean {
  return cwd !== null && (cwd === dir || cwd.startsWith(`${dir}/`));
}

function replaceCards(board: TodoBoard, next: TodoCard[]): TodoBoard {
  return next.some((card, index) => card !== board.cards[index]) ? { ...board, cards: next } : board;
}

/** Moves cards a day past the last status into the archive. Returns the same board when nothing moved. */
export function archiveDue(board: TodoBoard, now: number): TodoBoard {
  const lastId = board.statuses.at(-1)?.id;
  return replaceCards(
    board,
    board.cards.map((card) => {
      if (card.archivedAt !== null || card.statusId !== lastId) return card;
      if (card.doneAt === null) return { ...card, doneAt: now };
      return now - card.doneAt >= ARCHIVE_AFTER_MS ? { ...card, archivedAt: now } : card;
    }),
  );
}

/** A card with a Jira key and no worktree gets the one non-main worktree whose branch or name carries that key. */
export function linkWorktrees(board: TodoBoard, worktrees: readonly LinkableWorktree[], now: number): TodoBoard {
  const candidates = worktrees.filter((worktree) => !worktree.isMain);
  return replaceCards(
    board,
    board.cards.map((card) => {
      if (card.archivedAt !== null || card.worktreePath !== null || card.jira.length === 0) return card;
      const keys = card.jira.map((jira) => jira.key);
      const matches = candidates.filter(
        (worktree) => (card.repo === null || card.repo === worktree.repo) && (mentionsKey(worktree.branch, keys) || mentionsKey(worktree.name, keys)),
      );
      const [only] = matches;
      if (!only || matches.length > 1) return card;
      return { ...card, worktreePath: only.path, repo: only.repo, updatedAt: now };
    }),
  );
}

/**
 * Attaches sessions a card owns but nobody attached: ones run inside the card's own (non-main) worktree, and ones whose
 * branch carries the card's Jira key. A session another card holds, or one the user detached from this card, is left alone.
 */
export function linkSessions(
  board: TodoBoard,
  sessions: readonly LinkableSession[],
  mainWorktreePaths: ReadonlySet<string>,
  now: number,
): TodoBoard {
  const held = new Set(board.cards.flatMap((card) => card.sessionIds));
  const additions = new Map<string, string[]>();
  const active = board.cards.filter((card) => card.archivedAt === null);
  const byWorktree = (session: LinkableSession) =>
    active.find((card) => card.worktreePath !== null && !mainWorktreePaths.has(card.worktreePath) && inside(session.cwd, card.worktreePath));
  const byKey = (session: LinkableSession) =>
    active.find((card) => card.jira.length > 0 && mentionsKey(session.branch, card.jira.map((jira) => jira.key)));

  sessions.forEach((session) => {
    if (session.headless || held.has(session.id)) return;
    const card = byWorktree(session) ?? byKey(session);
    if (!card || card.ignoredSessionIds.includes(session.id)) return;
    held.add(session.id);
    additions.set(card.id, [...(additions.get(card.id) ?? []), session.id]);
  });
  if (additions.size === 0) return board;
  return {
    ...board,
    cards: board.cards.map((card) => {
      const added = additions.get(card.id);
      return added ? { ...card, sessionIds: [...card.sessionIds, ...added], updatedAt: now } : card;
    }),
  };
}
