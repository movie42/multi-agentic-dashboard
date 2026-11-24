import { isLinkUrl, textSegments } from "@/common/sketch/links";

/** Fills an editable box with the memo text, its links shown by name as anchors. */
export function fillEditable(box: HTMLElement, text: string) {
  box.replaceChildren(
    ...textSegments(text).map((segment) => {
      if (!segment.url) return document.createTextNode(segment.text);
      const anchor = document.createElement("a");
      anchor.href = segment.url;
      anchor.textContent = segment.text;
      return anchor;
    }),
  );
}

/** Reads the box back into memo text: anchors become `[name](url)`, or the bare URL when the name is the URL. */
export function readEditable(box: HTMLElement): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    const inner = [...node.childNodes].map(read).join("");
    if (node.tagName === "A") {
      const url = node.getAttribute("href") ?? "";
      const name = inner.replace(/[\]\n]/g, " ").trim();
      if (!isLinkUrl(url)) return inner;
      if (!name) return "";
      return name === url ? url : `[${name}](${url})`;
    }
    return node.tagName === "DIV" || node.tagName === "P" ? `\n${inner}` : inner;
  };
  const text = [...box.childNodes].map(read).join("");
  // Chromium keeps a placeholder <br> after a trailing line break so the caret can sit on the new line.
  return box.lastChild instanceof HTMLBRElement && text.endsWith("\n\n") ? text.slice(0, -1) : text;
}

/** A URL pasted over selected words inside the box turns them into a link; returns false for a usual paste. */
export function linkPastedSelection(box: HTMLElement, pasted: string): boolean {
  const url = pasted.trim();
  const selection = box.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || !isLinkUrl(url)) return false;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !box.contains(range.commonAncestorContainer)) return false;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.textContent = range.toString();
  range.deleteContents();
  range.insertNode(anchor);
  range.setStartAfter(anchor);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
