/** Opens every closed `<details>` around the element so it can be seen. */
export function openAncestors(element: Element | null) {
  const details = element?.closest("details");
  if (!details) return;
  details.open = true;
  openAncestors(details.parentElement);
}
