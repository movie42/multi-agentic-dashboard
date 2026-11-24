import { MessageProcessor, STRICT_VALIDATION } from "@a2ui/web_core";
import { Catalog } from "@a2ui/web_core/v1_0";
import { CATALOG_FUNCTIONS, CATALOG_ID, COMPONENT_APIS } from "./catalog.ts";

/** One A2UI agent-to-renderer message, kept as plain JSON so it survives the transcript round trip. */
export type A2uiMessage = Record<string, unknown>;

export type UiMessagesResult = { ok: true; messages: A2uiMessage[] } | { ok: false; error: string };

const validationCatalog = new Catalog(CATALOG_ID, "1.0", [...COMPONENT_APIS], [...CATALOG_FUNCTIONS]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function surfaceIdOf(messages: readonly A2uiMessage[]): string | null {
  for (const message of messages) {
    const create = message.createSurface;
    if (isRecord(create) && typeof create.surfaceId === "string") return create.surfaceId;
  }
  return null;
}

/** Applies the messages and returns the first error message, or null when every message applied. */
export function processErrors(processor: MessageProcessor, messages: readonly A2uiMessage[]): string | null {
  try {
    const errors = processor.processMessagesWithErrors(structuredClone(messages));
    const first = errors[0];
    if (!first) return null;
    const error: unknown = Reflect.get(first, "error");
    const message = typeof error === "object" && error !== null ? Reflect.get(error, "message") : null;
    return typeof message === "string" ? message : JSON.stringify(first);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Runs the messages through the same processor the renderer uses, with strict checks, so a broken surface is refused before it reaches the chat. */
export function validateUiMessages(value: unknown): UiMessagesResult {
  const list = parsed(value);
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "messages must be a non-empty array of A2UI messages." };
  if (!list.every(isRecord)) return { ok: false, error: "every message must be a JSON object." };
  const messages: A2uiMessage[] = list;
  const create = messages[0]?.createSurface;
  if (!isRecord(create) || create.catalogId !== CATALOG_ID) {
    return { ok: false, error: `the first message must be createSurface with catalogId "${CATALOG_ID}".` };
  }
  const processor = new MessageProcessor([validationCatalog], undefined, { validationConfig: STRICT_VALIDATION });
  const failure = processErrors(processor, messages);
  processor.dispose();
  return failure ? { ok: false, error: failure } : { ok: true, messages };
}
