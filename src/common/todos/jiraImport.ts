import { mentionsKey } from "./linking";
import type { TodoBoard, TodoCard, TodoJiraParent } from "./types";

export interface ImportedIssue {
  key: string;
  summary: string;
  url: string;
}

/** Auto import runs again only after this long; the board's [지라 가져오기] button ignores it. */
export const JIRA_IMPORT_INTERVAL_MS = 10 * 60 * 1000;

export function jiraImportDue(board: TodoBoard, now: number): boolean {
  const last = board.sync.jiraImportedAt;
  return last === null || now - last >= JIRA_IMPORT_INTERVAL_MS;
}

/**
 * New cards in the first status for issues no card carries yet. A key on any card, archived ones included, is never
 * imported again — deleting or archiving a card is how the user says they are done with it. A hand-made card whose
 * title or worktree already names the key gets the Jira chip instead of a duplicate card.
 */
export function mergeIssues(
  board: TodoBoard,
  issues: readonly ImportedIssue[],
  { now, newId }: { now: number; newId: () => string },
): { board: TodoBoard; added: number } {
  const known = new Set(board.cards.flatMap((card) => card.jira.map((jira) => jira.key)));
  const statusId = board.statuses[0]?.id;
  if (!statusId) return { board, added: 0 };
  const fresh = issues.filter((issue, index, all) => !known.has(issue.key) && all.findIndex((each) => each.key === issue.key) === index);
  const claimed = new Map<string, ImportedIssue[]>();
  const unclaimed = fresh.filter((issue) => {
    const owner = board.cards.find((card) => mentionsKey(card.title, [issue.key]) || mentionsKey(card.worktreePath, [issue.key]));
    if (!owner) return true;
    claimed.set(owner.id, [...(claimed.get(owner.id) ?? []), issue]);
    return false;
  });
  const existing = board.cards.map((card) => {
    const extra = claimed.get(card.id);
    return extra ? { ...card, jira: [...card.jira, ...extra.map((issue) => ({ key: issue.key, url: issue.url }))], updatedAt: now } : card;
  });
  const cards: TodoCard[] = unclaimed
    .map((issue) => ({
      id: newId(),
      title: issue.summary.slice(0, 200),
      memo: "",
      statusId,
      jira: [{ key: issue.key, url: issue.url }],
      links: [],
      sessionIds: [],
      ignoredSessionIds: [],
      repo: null,
      worktreePath: null,
      hidden: false,
      agentMovedAt: null,
      doneSuggestedAt: null,
      pendingLaunch: null,
      doneAt: null,
      archivedAt: null,
      origin: "jira",
      dueDate: null,
      startDate: null,
      jiraParent: null,
      jiraParentChecked: false,
      createdAt: now,
      updatedAt: now,
    }));
  return {
    board: { ...board, cards: [...existing, ...cards], sync: { ...board.sync, jiraImportedAt: now } },
    added: cards.length,
  };
}

/** Jira is asked about this many cards per import, so a first run on a big board does not stall for minutes. */
export const JIRA_PARENT_BATCH = 20;

/** Cards on the board whose first Jira key has not had its parent read yet. */
export function cardsAwaitingParent(board: TodoBoard): TodoCard[] {
  return board.cards.filter((card) => card.jira.length > 0 && !card.jiraParentChecked && card.archivedAt === null).slice(0, JIRA_PARENT_BATCH);
}

/** Records the parents read for these card ids; a card missing from `found` stays unread for the next import. */
export function applyJiraParents(board: TodoBoard, found: ReadonlyMap<string, TodoJiraParent | null>, now: number): { board: TodoBoard } {
  const cards = board.cards.map((card) => {
    if (!found.has(card.id)) return card;
    return { ...card, jiraParent: found.get(card.id) ?? null, jiraParentChecked: true, updatedAt: now };
  });
  return { board: { ...board, cards } };
}
