export const ACTION_PREFIX = "[A2UI action]";

export interface UiAction {
  surfaceId: string;
  name: string;
  context: Record<string, unknown>;
}

const HEAD = /^\[A2UI action\] surface=(\S+) name=(\S+)$/;

/** The message the session receives when someone uses a surface: a header line, then the context as JSON. */
export function actionText(action: UiAction): string {
  const head = `${ACTION_PREFIX} surface=${action.surfaceId} name=${action.name}`;
  return Object.keys(action.context).length > 0 ? `${head}\n${JSON.stringify(action.context)}` : head;
}

export function parseActionText(text: string): UiAction | null {
  const [head = "", ...rest] = text.trim().split("\n");
  const match = HEAD.exec(head.trim());
  if (!match) return null;
  const body = rest.join("\n").trim();
  if (!body) return { surfaceId: match[1] ?? "", name: match[2] ?? "", context: {} };
  try {
    const context: unknown = JSON.parse(body);
    if (typeof context !== "object" || context === null || Array.isArray(context)) return null;
    return { surfaceId: match[1] ?? "", name: match[2] ?? "", context: Object.fromEntries(Object.entries(context)) };
  } catch {
    return null;
  }
}
