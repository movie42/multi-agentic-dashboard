import { A2UI_VERSION, CATALOG_ID } from "@/common/a2ui/catalog";
import type { A2uiMessage } from "@/common/a2ui/messages";

export type Component = Record<string, unknown> & { id: string; component: string };

/** Markdown control characters in text that Text would otherwise render as formatting. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]<>()#+\-.!|~])/g, "\\$1");
}

export function text(id: string, value: string, variant: "body" | "caption" = "body"): Component {
  return { id, component: "Text", text: value, variant };
}

export function button(id: string, label: string, name: string, options: { variant?: string; context?: Record<string, unknown> } = {}): Component[] {
  return [
    { id, component: "Button", child: `${id}Label`, variant: options.variant ?? "default", action: { event: { name, context: options.context ?? {} } } },
    text(`${id}Label`, label),
  ];
}

export function surface(surfaceId: string, components: Component[], data: Record<string, unknown> | null = null): A2uiMessage[] {
  return [
    { version: A2UI_VERSION, createSurface: { surfaceId, catalogId: CATALOG_ID } },
    { version: A2UI_VERSION, updateComponents: { surfaceId, components } },
    ...(data ? [{ version: A2UI_VERSION, updateDataModel: { surfaceId, path: "/", value: data } }] : []),
  ];
}
