import "server-only";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { isMissing, parseJson, type Report } from "./fallback";

export interface JsonFileOptions<T> {
  file: string;
  schema: z.ZodType<T>;
  empty: () => T;
  warn: Report;
  scope: string;
  now?: () => number;
}

export class JsonFile<T> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: JsonFileOptions<T>) {}

  exists(): Promise<boolean> {
    return stat(this.options.file).then(
      () => true,
      (error: unknown) => {
        if (isMissing(error)) return false;
        throw error;
      },
    );
  }

  read(): Promise<T> {
    return this.serialized(() => this.load());
  }

  update(work: (value: T) => T): Promise<T> {
    return this.serialized(async () => {
      const next = work(await this.load());
      await this.write(next);
      return next;
    });
  }

  private serialized<R>(work: () => Promise<R>): Promise<R> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<T> {
    const { file, schema, empty, warn, scope } = this.options;
    const text = await readFile(file, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (text === null) return empty();
    const parsed = schema.safeParse(parseJson(text));
    if (parsed.success) return parsed.data;
    const backup = `${file}.${(this.options.now ?? Date.now)()}.bak`;
    await rename(file, backup);
    warn(scope, new Error("file was unreadable; moved aside"), { backup });
    return empty();
  }

  private async write(value: T): Promise<void> {
    const { file } = this.options;
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
    await rename(tmp, file);
  }
}
