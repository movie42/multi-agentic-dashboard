"use client";

import { useEffect, useRef } from "react";
import { useStoredList } from "@/client/shared/lib/useStoredList";

/** Set on <html> so panes that size against the sidebar (DocPanel) can read it without props. */
const SIDEBAR_COLLAPSED_ATTR = "data-sidebar-collapsed";

export function useSidebarCollapsed(): [boolean, () => void] {
  const [stored, writeStored] = useStoredList("agent-control:sidebar-collapsed");
  const collapsed = stored[0] === "1";
  const toggle = () => writeStored(collapsed ? [] : ["1"]);
  const latestToggle = useRef(toggle);

  useEffect(() => {
    latestToggle.current = toggle;
  });

  useEffect(() => {
    document.documentElement.toggleAttribute(SIDEBAR_COLLAPSED_ATTR, collapsed);
    // ResizeHandles re-clamp on resize; the doc panel's max width depends on the sidebar.
    window.dispatchEvent(new Event("resize"));
  }, [collapsed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.code !== "KeyB") return;
      event.preventDefault();
      latestToggle.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return [collapsed, toggle];
}
