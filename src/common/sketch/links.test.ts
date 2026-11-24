import { describe, expect, it } from "vitest";
import { isLinkUrl, textSegments } from "./links";

describe("sketch links", () => {
  it("accepts web and app addresses, not scripts or plain words", () => {
    expect(isLinkUrl("https://a.dev")).toBe(true);
    expect(isLinkUrl("hello world")).toBe(false);
    expect(isLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isLinkUrl("javascript://%0aalert(1)")).toBe(false);
  });

  it("links app addresses too, like an Obsidian note", () => {
    const note = "obsidian://open?vault=second-brain&file=00%20Inbox%2FCOMP-623";
    expect(isLinkUrl(note)).toBe(true);
    expect(textSegments(`메모 ${note} 끝`)).toEqual([{ text: "메모 " }, { text: note, url: note }, { text: " 끝" }]);
    expect(textSegments(`[회고](${note})`)).toEqual([{ text: "회고", url: note }]);
  });

  it("does not turn script addresses or times into links", () => {
    expect(textSegments("javascript://x 12:30")).toEqual([{ text: "javascript://x 12:30" }]);
    expect(textSegments("smb://host/share ms-msdt://x")).toEqual([{ text: "smb://host/share ms-msdt://x" }]);
    expect(isLinkUrl("smb://host/share")).toBe(false);
  });

  it("splits text into plain runs, named links and bare URLs", () => {
    expect(textSegments("see [PR](https://a.dev/1) and https://b.dev/x.")).toEqual([
      { text: "see " },
      { text: "PR", url: "https://a.dev/1" },
      { text: " and " },
      { text: "https://b.dev/x", url: "https://b.dev/x" },
      { text: "." },
    ]);
  });
});
