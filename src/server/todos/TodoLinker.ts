import "server-only";
import type { BoardSnapshot } from "@/common/board/types";
import { archiveDue, linkSessions, linkWorktrees, type LinkableSession } from "@/common/todos/linking";
import type { ScannedSession } from "@/server/sessions/summarize";
import type { TodoStore } from "./TodoStore";

/** Past sessions change slowly and the scan reads every transcript folder, so it runs at most this often. */
const PAST_SCAN_MS = 2 * 60 * 1000;

/**
 * Runs on every board poll: archives cards a day past done, links cards to the worktree their Jira key names,
 * and attaches sessions that belong to a card — open ones every poll, past ones from the session index now and then.
 */
export class TodoLinker {
  private pastScannedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly store: Pick<TodoStore, "transact">,
    private readonly listSessions: () => Promise<ScannedSession[]>,
    private readonly now: () => number = Date.now,
  ) {}

  async observe(snapshot: BoardSnapshot): Promise<void> {
    const now = this.now();
    const live: LinkableSession[] = snapshot.agents.flatMap((agent) =>
      agent.session ? [{ id: agent.session.id, cwd: agent.worktreePath, branch: agent.branch, headless: false }] : [],
    );
    const past = now - this.pastScannedAt >= PAST_SCAN_MS ? await this.pastSessions(now) : [];
    const mains = new Set(snapshot.worktrees.filter((worktree) => worktree.isMain).map((worktree) => worktree.path));
    await this.store.transact((board) => {
      const archived = archiveDue(board, now);
      const placed = linkWorktrees(archived, snapshot.worktrees, now);
      return { board: linkSessions(placed, [...live, ...past], mains, now) };
    });
  }

  private async pastSessions(now: number): Promise<LinkableSession[]> {
    this.pastScannedAt = now;
    return (await this.listSessions()).map((session) => ({
      id: session.sessionId,
      cwd: session.cwd,
      branch: session.gitBranch,
      headless: session.origin === "headless",
    }));
  }
}
