import { describe, expect, it } from "vitest";
import type { AskThread, IntentDiffResult } from "@/common/intentDiff/types";
import { buildSearchIndex, searchIndex } from "./searchIndex";

const result = {
  range: { worktreePath: "/w", base: "b", baseLabel: "main", head: null, branch: "x", since: 0, until: null },
  sessionCount: 1,
  snapshotCount: 0,
  archivedCount: 0,
  files: [
    {
      file: "src/board.ts",
      oldFile: null,
      change: "modified",
      binary: false,
      hunks: [
        {
          id: "src/board.ts#0",
          file: "src/board.ts",
          header: "",
          oldStart: 1,
          newStart: 1,
          lines: [
            { kind: "ctx", text: "const keep = 1;", oldNo: 1, newNo: 1 },
            { kind: "del", text: "const pollMs = 5000;", oldNo: 2, newNo: null },
            { kind: "add", text: "const pollMs = 3000;", oldNo: null, newNo: 2 },
          ],
        },
      ],
    },
  ],
  plan: {
    taskKey: "d/t",
    title: "t",
    phases: [{ id: "P1", title: "p", items: [{ id: "P1-1", title: "보드 폴링 주기", done: true, files: [], completedAt: null, groups: [] }] }],
  },
  groups: [],
  unplanned: [],
  missing: [],
  mechanical: [],
  unknown: [],
  featureMap: { files: {}, clusters: [], loose: [] },
  flow: {
    symbols: {
      s1: { id: "s1", name: "fetchBoard", kind: "function", file: "src/board.ts", startLine: 2, endLine: 9, owner: null, intents: ["폴링 줄이기"], lines: [{ kind: "add", text: "const pollMs = 3000;", oldNo: null, newNo: 2 }, { kind: "ctx", text: "return folded();", oldNo: 8, newNo: 9 }] },
    },
    flows: {},
  },
  stats: { hunks: 1, exact: 0, file: 0, none: 1, mechanical: 0 },
} as unknown as IntentDiffResult;

const thread: AskThread = {
  id: "t1",
  worktreePath: "/w",
  anchor: { kind: "lines", file: "src/board.ts", startLine: 2, endLine: 2 },
  label: "board.ts",
  target: { kind: "fresh", reason: "chosen" },
  sessionId: "s",
  cwd: "/w",
  turns: [{ question: "왜 3초야?", answer: "대시보드 반응 속도 때문", error: null, askedAt: 1, answeredAt: 2 }],
  conclusion: { text: "상수로 빼요", needsChange: true, draftedAt: 3, confirmedAt: null, sentAt: null },
  createdAt: 1,
  updatedAt: 2,
};

const index = buildSearchIndex(result, [thread], (id) => `step-${id}`);

describe("searchIndex", () => {
  it("finds removed and added code lines, pointing at the side each lives on", () => {
    const hits = searchIndex(index, "pollMs");
    expect(hits.filter((hit) => hit.group === "code").map((hit) => hit.target.line)).toEqual([
      { file: "src/board.ts", line: 2, side: "old" },
      { file: "src/board.ts", line: 2, side: "new" },
    ]);
  });

  it("finds unchanged lines that only a flow step shows, once per line", () => {
    expect(searchIndex(index, "folded")).toEqual([expect.objectContaining({ group: "code", target: { anchor: null, line: { file: "src/board.ts", line: 9, side: "new" }, needsPlan: false } })]);
    expect(searchIndex(index, "pollMs = 3000").filter((hit) => hit.group === "code")).toHaveLength(1);
  });

  it("matches every word, case-insensitively, across files, symbols and plan items", () => {
    expect(searchIndex(index, "BOARD.ts").map((hit) => hit.group)).toContain("file");
    expect(searchIndex(index, "fetchboard")[0]).toMatchObject({ group: "symbol", target: { anchor: "step-s1", needsPlan: true } });
    expect(searchIndex(index, "폴링 주기")).toEqual([expect.objectContaining({ group: "plan", target: { anchor: "item-P1-1", line: null, needsPlan: true } })]);
  });

  it("finds a thread by its question, answer or conclusion and goes to its line", () => {
    for (const query of ["3초", "반응 속도", "상수로"]) {
      expect(searchIndex(index, query).find((hit) => hit.group === "thread")?.target.line).toEqual({ file: "src/board.ts", line: 2, side: "new" });
    }
  });

  it("returns nothing for a blank query and orders groups file → symbol → code → plan → thread", () => {
    expect(searchIndex(index, "   ")).toEqual([]);
    const groups = searchIndex(index, "board").map((hit) => hit.group);
    expect(groups).toEqual([...groups].sort((a, b) => ["file", "symbol", "code", "plan", "thread"].indexOf(a) - ["file", "symbol", "code", "plan", "thread"].indexOf(b)));
  });
});
