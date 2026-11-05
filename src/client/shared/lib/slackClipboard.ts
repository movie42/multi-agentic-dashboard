// Slack's composer keeps bold, italic, links, lists, quotes and code from pasted HTML,
// but has no headings or tables — a pasted table collapses into one run-on line.
function replaceWith(node: Element, replacement: Node) {
  node.parentNode?.replaceChild(replacement, node);
}

function boldParagraph(doc: Document, text: string): HTMLParagraphElement {
  const paragraph = doc.createElement("p");
  const strong = doc.createElement("b");
  strong.textContent = text;
  paragraph.appendChild(strong);
  return paragraph;
}

function cellTexts(row: Element): string[] {
  return Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent?.trim() ?? "");
}

function tableToList(doc: Document, table: HTMLTableElement): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const rows = Array.from(table.querySelectorAll("tr"));
  const header = rows[0]?.querySelector("th") ? rows.shift() : undefined;
  if (header) fragment.appendChild(boldParagraph(doc, cellTexts(header).join(" · ")));

  const list = doc.createElement("ul");
  for (const row of rows) {
    const item = doc.createElement("li");
    item.textContent = cellTexts(row).join(" · ");
    list.appendChild(item);
  }
  fragment.appendChild(list);
  return fragment;
}

export function toSlackHtml(source: HTMLElement): string {
  const root = source.cloneNode(true);
  if (!(root instanceof HTMLElement)) return source.innerHTML;
  const doc = root.ownerDocument;

  root.querySelectorAll("summary, [data-copy-skip]").forEach((node) => node.remove());
  root.querySelectorAll("hr").forEach((node) => node.remove());
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) =>
    replaceWith(heading, boldParagraph(doc, heading.textContent ?? "")),
  );
  root.querySelectorAll("table").forEach((table) => replaceWith(table, tableToList(doc, table)));
  root.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((box) =>
    replaceWith(box, doc.createTextNode(box.checked ? "☑ " : "☐ ")),
  );
  root.querySelectorAll("[class]").forEach((node) => node.removeAttribute("class"));

  return root.innerHTML;
}

export async function copyForSlack(source: HTMLElement, plainText: string): Promise<void> {
  const html = toSlackHtml(source);
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    }),
  ]);
}
