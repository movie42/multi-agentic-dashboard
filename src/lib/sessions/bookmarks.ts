import { services } from "@/server/container";
import type { SessionBookmark } from "./types";

export { BOOKMARK_MEMO_LIMIT } from "@/common/sessions/limits";

export function readBookmarks(): Promise<Map<string, SessionBookmark>> {
  return services().bookmarks.read();
}

export function saveBookmark(input: { sessionId: string; name: string; cwd: string; memo: string }): Promise<void> {
  return services().bookmarks.save(input);
}

export function removeBookmark(sessionId: string): Promise<void> {
  return services().bookmarks.remove(sessionId);
}
