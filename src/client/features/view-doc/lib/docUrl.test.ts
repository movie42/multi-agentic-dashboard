import { describe, expect, it } from "vitest";
import { docLabel, docUrl, flowTaskOf, isViewableDoc, targetOfDocUrl } from "./docUrl";

describe("isViewableDoc", () => {
  it.each([
    ["/w/docs/gift/T1/index.html", true],
    ["/w/docs/index.html", true],
    ["/w/src/index.html", false],
    ["/w/docs/gift/prd.md", false],
    ["https://example.com/docs/a.html", false],
  ])("%s → %s", (target, expected) => {
    expect(isViewableDoc(target)).toBe(expected);
  });
});

describe("docUrl", () => {
  it("keeps the file path as the URL path so relative links resolve", () => {
    expect(docUrl("/w/docs/한글 폴더/index.html")).toBe("/api/doc/w/docs/%ED%95%9C%EA%B8%80%20%ED%8F%B4%EB%8D%94/index.html");
  });
});

describe("docLabel", () => {
  it("names an index page by its folder", () => {
    expect(docLabel("/w/docs/gift/APP-1/index.html")).toBe("APP-1");
  });
  it("adds the file name for other pages", () => {
    expect(docLabel("/w/docs/gift/APP-1/03-tasks.html")).toBe("APP-1 · 03-tasks");
  });
  it("names the root index", () => {
    expect(docLabel("/w/docs/index.html")).toBe("index");
  });
});

describe("targetOfDocUrl", () => {
  it("reads the file path back from a served URL", () => {
    const target = "/w/docs/한글 폴더/index.html";
    expect(targetOfDocUrl(docUrl(target))).toBe(target);
  });
  it("ignores pages outside the doc route", () => {
    expect(targetOfDocUrl("/diff")).toBeNull();
  });
});

describe("flowTaskOf", () => {
  it("splits a task page into its worktree and domain/task", () => {
    expect(flowTaskOf("/w/repo/docs/gift/APP-1/02-grill.html")).toEqual({ worktreePath: "/w/repo", task: "gift/APP-1" });
  });

  it("ignores pages that are not task pages", () => {
    expect(flowTaskOf("/w/repo/docs/gift/index.html")).toBeNull();
    expect(flowTaskOf("/w/repo/docs/a/b/c/d.html")).toBeNull();
  });
});
