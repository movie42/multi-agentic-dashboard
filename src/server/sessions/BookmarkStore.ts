import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SessionBookmark } from "@/lib/sessions/types";
import { isMissing, parseJson, type Report } from "../shared/fallback";
import { bookmarkLineSchema, type BookmarkLine } from "./schema";

export function sbTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseBookmarkLines(text: string, warn: Report): BookmarkLine[] {
  return text
    .split("\n")
    .filter((raw) => raw.trim())
    .flatMap((raw) => {
      const json = parseJson(raw);
      if (json === undefined) {
        warn("bookmarks", "skipped a malformed line");
        return [];
      }
      const parsed = bookmarkLineSchema.safeParse(json);
      return parsed.success ? [parsed.data] : [];
    });
}

export class BookmarkStore {
  constructor(
    private readonly file: string,
    private readonly warn: Report,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(): Promise<Map<string, SessionBookmark>> {
    const lines = await this.readLines();
    return new Map(
      lines
        .filter((line) => line.provider === "claude")
        .map((line) => [
          line.session_id,
          { name: line.name, memo: line.memo ?? "", createdAt: line.created_at, lastOpenedAt: line.last_opened_at ?? null },
        ]),
    );
  }

  async save(input: { sessionId: string; name: string; cwd: string; memo: string }): Promise<void> {
    const lines = await this.readLines();
    const existing = lines.find((line) => line.session_id === input.sessionId);
    const next: BookmarkLine = {
      provider: "claude",
      name: input.name,
      session_id: input.sessionId,
      cwd: input.cwd,
      created_at: existing?.created_at ?? sbTimestamp(this.now()),
      memo: input.memo,
      ...(existing?.last_opened_at ? { last_opened_at: existing.last_opened_at } : {}),
    };
    await this.writeLines([...lines.filter((line) => line.session_id !== input.sessionId), next]);
  }

  async remove(sessionId: string): Promise<void> {
    const lines = await this.readLines();
    await this.writeLines(lines.filter((line) => line.session_id !== sessionId));
  }

  private async readLines(): Promise<BookmarkLine[]> {
    const text = await readFile(this.file, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return "";
      throw error;
    });
    return parseBookmarkLines(text, this.warn);
  }

  private async writeLines(lines: BookmarkLine[]): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, lines.map((line) => `${JSON.stringify(line)}\n`).join(""));
    await rename(tmp, this.file);
  }
}
