import "server-only";
import { randomUUID } from "node:crypto";
import { applyJiraParents, cardsAwaitingParent, jiraImportDue, mergeIssues } from "@/common/todos/jiraImport";
import type { TodoJiraParent } from "@/common/todos/types";
import type { AssignedIssue, JiraParent } from "@/server/workflow/JiraInfo";
import type { ReportFn } from "@/server/shared/ports";
import type { TodoStore } from "./TodoStore";

interface JiraSource {
  searchAssigned: () => Promise<AssignedIssue[]>;
  siteUrl: () => Promise<string | null>;
  parentOf?: (key: string) => Promise<JiraParent | null>;
}

/** Parallel `acli` lookups; each takes about 1.5s, so a batch of 20 finishes in a few seconds. */
const PARENT_CONCURRENCY = 5;

async function mapLimit<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const queue = items.map((item, index) => ({ item, index }));
  const lane = async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job) results[job.index] = await work(job.item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

export interface JiraImportResult {
  added: number;
  total: number;
}

/** Brings Jira issues assigned to the acli user onto the to-do board as cards. */
export class TodoJiraImporter {
  private running: Promise<JiraImportResult> | null = null;
  private readingParents: Promise<void> | null = null;

  constructor(
    private readonly store: Pick<TodoStore, "read" | "transact">,
    private readonly jira: JiraSource,
    private readonly warn: ReportFn,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID,
  ) {}

  run(): Promise<JiraImportResult> {
    this.running ??= this.importOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Fire-and-forget import when the last one is older than the auto interval. */
  async runIfDue(): Promise<void> {
    if (!jiraImportDue(await this.store.read(), this.now())) return;
    await this.run().catch((error: unknown) => this.warn("todos", error, { step: "auto jira import" }));
  }

  private async importOnce(): Promise<JiraImportResult> {
    const [issues, site] = await Promise.all([this.jira.searchAssigned(), this.jira.siteUrl()]);
    if (!site) throw new Error("acli에서 지라 사이트를 읽지 못했어요. 터미널에서 acli jira auth status를 확인해 주세요");
    const { added } = await this.store.transact((board) =>
      mergeIssues(
        board,
        issues.map((issue) => ({ key: issue.key, summary: issue.summary, url: `${site}/browse/${issue.key}` })),
        { now: this.now(), newId: this.newId },
      ),
    );
    this.startReadingParents();
    return { added, total: issues.length };
  }

  /** Resolves once the parent lookups started by the last import have been written. */
  whenParentsRead(): Promise<void> {
    return this.readingParents ?? Promise.resolve();
  }

  private startReadingParents(): void {
    this.readingParents ??= this.readParents()
      .catch((error: unknown) => this.warn("todos", error, { step: "jira parent" }))
      .finally(() => {
        this.readingParents = null;
      });
  }

  /**
   * One failed lookup while others succeed is that issue's own problem (deleted, no permission), so it is marked read
   * and does not hold the batch forever. When every lookup fails Jira itself is down, and all stay unread for next time.
   */
  private async readParents(): Promise<void> {
    if (!this.jira.parentOf) return;
    const cards = cardsAwaitingParent(await this.store.read());
    const results = await mapLimit(cards, PARENT_CONCURRENCY, async (card): Promise<[string, TodoJiraParent | null] | Error> => {
      const key = card.jira[0]?.key ?? "";
      try {
        return [card.id, (await this.jira.parentOf?.(key)) ?? null];
      } catch (error) {
        this.warn("todos", error, { step: "jira parent", key });
        return error instanceof Error ? error : new Error(String(error));
      }
    });
    const found = new Map(results.filter((result): result is [string, TodoJiraParent | null] => !(result instanceof Error)));
    if (found.size === 0) return;
    cards.forEach((card) => {
      if (!found.has(card.id)) found.set(card.id, null);
    });
    await this.store.transact((board) => applyJiraParents(board, found, this.now()));
  }

}
