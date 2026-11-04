import { describe, expect, it } from "vitest";
import {
  isMissingRemote,
  isPullRequestNotApplicable,
  isSharedBranch,
  modeOf,
  ownerFromRemoteUrl,
  parsePullRequestList,
} from "./github";

describe("github helpers", () => {
  it("treats root branches as shared", () => {
    expect(["main", "develop", "release/1.2", "main-v2"].every(isSharedBranch)).toBe(true);
    expect(isSharedBranch("feat/x")).toBe(false);
  });

  it("reads the owner from ssh and https remotes", () => {
    expect(ownerFromRemoteUrl("git@github.com:movie42/repo.git\n")).toBe("movie42");
    expect(ownerFromRemoteUrl("https://github.com/acme/repo")).toBe("acme");
    expect(ownerFromRemoteUrl("https://gitlab.com/acme/repo")).toBe("unknown-host");
  });

  it("is personal when the owner is missing or matches the login", () => {
    expect(modeOf(null, "me")).toBe("personal");
    expect(modeOf("Me", "me")).toBe("personal");
    expect(modeOf("acme", "me")).toBe("company");
    expect(modeOf("acme", null)).toBe("company");
  });

  it("parses the first pull request or none", () => {
    expect(parsePullRequestList('[{"number":3,"state":"OPEN","isDraft":false,"url":"u","extra":1}]')).toEqual({
      kind: "found",
      number: 3,
      state: "OPEN",
      isDraft: false,
      url: "u",
    });
    expect(parsePullRequestList("[]")).toEqual({ kind: "none" });
    expect(() => parsePullRequestList('[{"number":"x"}]')).toThrow();
  });

  it("recognises stderr that means no remote", () => {
    expect(isPullRequestNotApplicable("none of the git remotes configured")).toBe(true);
    expect(isMissingRemote("error: No such remote 'origin'")).toBe(true);
    expect(isMissingRemote("fatal: network down")).toBe(false);
  });
});
