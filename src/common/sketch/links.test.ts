import { describe, expect, it } from "vitest";
import { linkSelection, textSegments } from "./links";

describe("sketch links", () => {
  it("wraps the selected words in a link when a URL is pasted over them", () => {
    expect(linkSelection("리뷰 답장 보기", 3, 5, "https://github.com/x/pull/1")).toEqual({
      text: "리뷰 [답장](https://github.com/x/pull/1) 보기",
      caret: 36,
    });
  });

  it("leaves a plain paste alone: nothing selected, or not a URL", () => {
    expect(linkSelection("abc", 1, 1, "https://a.dev")).toBeNull();
    expect(linkSelection("abc", 0, 3, "hello world")).toBeNull();
    expect(linkSelection("abc", 0, 3, "javascript:alert(1)")).toBeNull();
    expect(linkSelection("abc", 0, 3, "javascript://%0aalert(1)")).toBeNull();
  });

  it("links app addresses too, like an Obsidian note", () => {
    const note = "obsidian://open?vault=second-brain&file=00%20Inbox%2FCOMP-623";
    expect(linkSelection("회고", 0, 2, note)).toEqual({ text: `[회고](${note})`, caret: 6 + note.length });
    expect(textSegments(`메모 ${note} 끝`)).toEqual([{ text: "메모 " }, { text: note, url: note }, { text: " 끝" }]);
    expect(textSegments(`[회고](${note})`)).toEqual([{ text: "회고", url: note }]);
  });

  it("does not turn script addresses or times into links", () => {
    expect(textSegments("javascript://x 12:30")).toEqual([{ text: "javascript://x 12:30" }]);
    expect(textSegments("smb://host/share ms-msdt://x")).toEqual([{ text: "smb://host/share ms-msdt://x" }]);
    expect(linkSelection("abc", 0, 3, "smb://host/share")).toBeNull();
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
