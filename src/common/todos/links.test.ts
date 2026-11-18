import { describe, expect, it } from "vitest";
import { linkCaption, parseCardLink } from "./links";

describe("parseCardLink", () => {
  it("sends Jira issues to the Jira chips", () => {
    expect(parseCardLink("https://paycrux.atlassian.net/browse/VDCO-1")).toMatchObject({ type: "jira", jira: { key: "VDCO-1" } });
  });

  it.each([
    ["https://paycrux.slack.com/archives/C08C2K5FT3J/p1794470289567169", "slack"],
    ["https://www.notion.so/team/Spec-0123456789abcdef0123456789abcdef", "notion"],
    ["https://www.figma.com/design/abc/File?node-id=1-2", "figma"],
    ["https://github.com/paycrux/partner/pull/382", "github-pr"],
    ["https://github.com/paycrux/partner", "other"],
  ])("classifies %s as %s", (url, kind) => {
    expect(parseCardLink(url)).toMatchObject({ type: "link", link: { kind } });
  });

  it("rejects text that is not an address", () => {
    expect(parseCardLink("hello")).toBeNull();
    expect(parseCardLink("javascript:alert(1)")).toBeNull();
  });
});

describe("linkCaption", () => {
  it("names a PR by repo and number, a Notion page by its title", () => {
    expect(linkCaption({ kind: "github-pr", url: "https://github.com/paycrux/partner/pull/382" })).toBe("partner #382");
    expect(linkCaption({ kind: "notion", url: "https://www.notion.so/team/Spec-Page-0123456789abcdef0123456789abcdef" })).toBe("Spec Page");
    expect(linkCaption({ kind: "slack", url: "https://x.slack.com/archives/C1/p2" })).toBe("#C1");
  });
});
