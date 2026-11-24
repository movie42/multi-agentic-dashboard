import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { sketchFileSchema } from "@/common/sketch/schema";
import type { SketchItem } from "@/common/sketch/types";
import { isMissing, parseJson, type Report } from "../shared/fallback";

type SketchFile = { boards: Record<string, SketchItem[]> };

/** Every canvas's memos and drawings in one file on this machine, so the Dock app and browsers share them. */
export class SketchStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly warn: Report,
    private readonly now: () => number = Date.now,
  ) {}

  read(key: string): Promise<SketchItem[]> {
    return this.serialized(async () => (await this.load()).boards[key] ?? []);
  }

  write(key: string, items: SketchItem[]): Promise<void> {
    return this.serialized(async () => {
      const { boards } = await this.load();
      const rest = Object.fromEntries(Object.entries(boards).filter(([name]) => name !== key));
      await this.save({ boards: items.length > 0 ? { ...rest, [key]: items } : rest });
    });
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<SketchFile> {
    const text = await readFile(this.file, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (text === null) return { boards: {} };
    const parsed = sketchFileSchema.safeParse(parseJson(text));
    if (parsed.success) return parsed.data;
    const backup = `${this.file}.${this.now()}.bak`;
    await rename(this.file, backup);
    this.warn("sketches", new Error("sketch file was unreadable; moved aside"), { backup });
    return { boards: {} };
  }

  private async save(data: SketchFile): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data)}\n`);
    await rename(tmp, this.file);
  }
}
