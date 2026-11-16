import { afterEach, describe, expect, it, vi } from "vitest";
import { followJumpTarget } from "./jumpTarget";

function cardWith(inner: string): HTMLElement {
  const card = document.createElement("article");
  card.innerHTML = inner;
  document.body.append(card);
  return card;
}

const scrolls: { element: Element; options: ScrollIntoViewOptions | boolean | undefined }[] = [];

describe("followJumpTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    scrolls.length = 0;
  });

  const spy = () => {
    Element.prototype.scrollIntoView ??= () => undefined;
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, options) {
      scrolls.push({ element: this, options });
    });
  };

  it("centres the question card instead of the card's top", () => {
    spy();
    const card = cardWith(`<header>제목</header><ol>${"<li>대화</li>".repeat(50)}</ol><div data-jump-focus>질문</div>`);
    const stop = followJumpTarget(card);
    stop();
    expect(scrolls).toEqual([{ element: card.querySelector("[data-jump-focus]"), options: { block: "center" } }]);
  });

  it("shows the end of the card when nothing is asked", () => {
    spy();
    const card = cardWith(`<header>제목</header><ol><li>대화</li></ol>`);
    const stop = followJumpTarget(card);
    stop();
    expect(scrolls).toEqual([{ element: card, options: { block: "end" } }]);
  });

  it("stops following once the user scrolls", () => {
    spy();
    const card = cardWith(`<ol><li>대화</li></ol>`);
    followJumpTarget(card);
    window.dispatchEvent(new Event("wheel"));
    expect(scrolls).toHaveLength(1);
  });
});
