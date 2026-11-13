import { describe, expect, it, vi } from "vitest";
import { issueKeyOfBranch, JiraInfo, siteOfAuthStatus, statusOfIssueView } from "./JiraInfo";

describe("JiraInfo helpers", () => {
  it("takes the issue key from a branch name", () => {
    expect(issueKeyOfBranch("feat/COMP-628")).toBe("COMP-628");
    expect(issueKeyOfBranch("agent-control/git-graph")).toBeNull();
    expect(issueKeyOfBranch(null)).toBeNull();
  });

  it("reads the site from acli auth status", () => {
    expect(siteOfAuthStatus("✓ Authenticated\n  Site: paycrux.atlassian.net\n  Email: a@b")).toBe("https://paycrux.atlassian.net");
    expect(siteOfAuthStatus("not logged in")).toBeNull();
  });

  it("reads the status name from acli workitem view", () => {
    expect(statusOfIssueView(JSON.stringify({ key: "COMP-1", fields: { status: { name: "작업 중" } } }))).toBe("작업 중");
  });
});

describe("JiraInfo.getIssue", () => {
  it("returns loading first, then the live status with a browse link", async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) =>
      args[1] === "auth"
        ? { stdout: "  Site: paycrux.atlassian.net\n", stderr: "" }
        : { stdout: JSON.stringify({ fields: { status: { name: "작업 중" } } }), stderr: "" },
    );
    const jira = new JiraInfo({ execFile, warn: vi.fn() });
    expect(jira.getIssue("feat/COMP-628")).toEqual({ kind: "loading", key: "COMP-628", url: null });
    await vi.waitFor(() =>
      expect(jira.getIssue("feat/COMP-628")).toEqual({
        kind: "found",
        key: "COMP-628",
        url: "https://paycrux.atlassian.net/browse/COMP-628",
        status: "작업 중",
      }),
    );
  });

  it("keeps the cached status until a refresh is requested, then refetches it", async () => {
    let status = "작업 중";
    const execFile = vi.fn(async (_file: string, args: string[]) =>
      args[1] === "auth"
        ? { stdout: "  Site: paycrux.atlassian.net\n", stderr: "" }
        : { stdout: JSON.stringify({ fields: { status: { name: status } } }), stderr: "" },
    );
    const jira = new JiraInfo({ execFile, warn: vi.fn() });
    jira.getIssue("feat/COMP-1");
    await vi.waitFor(() => expect(jira.getIssue("feat/COMP-1")).toMatchObject({ status: "작업 중" }));
    status = "[DEV] 개발 완료";
    expect(jira.getIssue("feat/COMP-1")).toMatchObject({ status: "작업 중" });
    jira.requestRefresh();
    expect(jira.getIssue("feat/COMP-1")).toMatchObject({ status: "작업 중" });
    await vi.waitFor(() => expect(jira.getIssue("feat/COMP-1")).toMatchObject({ status: "[DEV] 개발 완료" }));
  });

  it("skips branches without an issue key", () => {
    const execFile = vi.fn();
    expect(new JiraInfo({ execFile, warn: vi.fn() }).getIssue("main")).toEqual({ kind: "not-applicable" });
    expect(execFile).not.toHaveBeenCalled();
  });
});
