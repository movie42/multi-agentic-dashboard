import { describe, expect, it, vi } from "vitest";
import { defaultBoard } from "@/common/todos/board";
import type { TodoBoard } from "@/common/todos/types";
import { issuesOfSearch } from "@/server/workflow/JiraInfo";
import { TodoJiraImporter } from "./TodoJiraImporter";

vi.mock("server-only", () => ({}));

function memoryStore(initial: TodoBoard) {
  const box = { board: initial };
  return {
    box,
    read: async () => box.board,
    transact: async <T extends { board: TodoBoard }>(work: (board: TodoBoard) => T) => {
      const result = work(box.board);
      box.board = result.board;
      return result;
    },
  };
}

const ISSUES = [
  { key: "AB-1", summary: "첫 이슈", status: "접수" },
  { key: "AB-2", summary: "둘째 이슈", status: "계획" },
];

describe("issuesOfSearch", () => {
  it("reads key, summary and status from acli search JSON", () => {
    const stdout = JSON.stringify([{ key: "AB-1", fields: { summary: " 제목 ", status: { name: "접수" } } }, { key: "AB-2", fields: {} }]);
    expect(issuesOfSearch(stdout)).toEqual([
      { key: "AB-1", summary: "제목", status: "접수" },
      { key: "AB-2", summary: "AB-2", status: null },
    ]);
  });
});

describe("TodoJiraImporter", () => {
  it("adds a card per new issue in the first status and never re-adds a known key", async () => {
    let n = 0;
    const store = memoryStore(defaultBoard());
    const jira = { searchAssigned: async () => ISSUES, siteUrl: async () => "https://x.atlassian.net" };
    const importer = new TodoJiraImporter(store, jira, () => {}, () => 100, () => `c${++n}`);

    expect(await importer.run()).toEqual({ added: 2, total: 2 });
    expect(store.box.board.cards.map((card) => [card.title, card.statusId, card.origin, card.jira[0]?.url])).toEqual([
      ["첫 이슈", "st-todo", "jira", "https://x.atlassian.net/browse/AB-1"],
      ["둘째 이슈", "st-todo", "jira", "https://x.atlassian.net/browse/AB-2"],
    ]);
    store.box.board = { ...store.box.board, cards: store.box.board.cards.map((card) => ({ ...card, archivedAt: 5 })) };
    expect(await importer.run()).toEqual({ added: 0, total: 2 });
    expect(store.box.board.sync.jiraImportedAt).toBe(100);
  });

  it("gives the Jira chip to a hand-made card that already names the key instead of adding a duplicate", async () => {
    const base = defaultBoard();
    const store = memoryStore(base);
    const jira = { searchAssigned: async () => ISSUES, siteUrl: async () => "https://x" };
    const importer = new TodoJiraImporter(store, jira, () => {}, () => 1, () => "new");
    store.box.board = (await import("@/common/todos/ops")).applyTodoOp(base, { type: "card-create", title: "AB-1 손으로 만든 카드" }, { now: 0, newId: () => "hand" }).board;
    expect(await importer.run()).toEqual({ added: 1, total: 2 });
    expect(store.box.board.cards.find((card) => card.id === "hand")?.jira.map((each) => each.key)).toEqual(["AB-1"]);
  });

  it("reads each Jira card's story parent once and keeps unread cards for the next run when Jira fails", async () => {
    let n = 0;
    const store = memoryStore(defaultBoard());
    const parentOf = vi.fn(async (key: string) => {
      if (key === "AB-2") throw new Error("acli down");
      return key === "AB-1" ? { key: "AB-0", summary: "스토리" } : null;
    });
    const jira = {
      searchAssigned: async () => [...ISSUES, { key: "AB-3", summary: "셋째", status: null }],
      siteUrl: async () => "https://x",
      parentOf,
    };
    const importer = new TodoJiraImporter(store, jira, () => {}, () => 1, () => `c${++n}`);

    expect(await importer.run()).toEqual({ added: 3, total: 3 });
    await importer.whenParentsRead();
    expect(store.box.board.cards.map((card) => [card.jira[0]?.key, card.jiraParent, card.jiraParentChecked])).toEqual([
      ["AB-1", { key: "AB-0", summary: "스토리" }, true],
      ["AB-2", null, true],
      ["AB-3", null, true],
    ]);
  });

  it("leaves every card unread for the next import when no parent lookup succeeds", async () => {
    let n = 0;
    const store = memoryStore(defaultBoard());
    const parentOf = vi.fn(async () => {
      throw new Error("acli down");
    });
    const importer = new TodoJiraImporter(store, { searchAssigned: async () => ISSUES, siteUrl: async () => "https://x", parentOf }, () => {}, () => 1, () => `c${++n}`);
    await importer.run();
    await importer.whenParentsRead();
    expect(store.box.board.cards.map((card) => card.jiraParentChecked)).toEqual([false, false]);
  });

  it("auto import waits for the interval", async () => {
    const store = memoryStore({ ...defaultBoard(), sync: { jiraImportedAt: 100 } });
    const searchAssigned = vi.fn(async () => ISSUES);
    const importer = new TodoJiraImporter(store, { searchAssigned, siteUrl: async () => "https://x" }, () => {}, () => 200);
    await importer.runIfDue();
    expect(searchAssigned).not.toHaveBeenCalled();
  });
});
