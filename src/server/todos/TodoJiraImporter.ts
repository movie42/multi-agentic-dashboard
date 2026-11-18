import "server-only";
import { randomUUID } from "node:crypto";
import { jiraImportDue, mergeIssues } from "@/common/todos/jiraImport";
import type { AssignedIssue } from "@/server/workflow/JiraInfo";
import type { ReportFn } from "@/server/shared/ports";
import type { TodoStore } from "./TodoStore";

interface JiraSource {
  searchAssigned: () => Promise<AssignedIssue[]>;
  siteUrl: () => Promise<string | null>;
}

export interface JiraImportResult {
  added: number;
  total: number;
}

/** Brings Jira issues assigned to the acli user onto the to-do board as cards. */
export class TodoJiraImporter {
  private running: Promise<JiraImportResult> | null = null;

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
    return { added, total: issues.length };
  }
}
