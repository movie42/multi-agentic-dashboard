import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultBoard } from "@/common/todos/board";
import { applyTodoOp, type TodoOp, type TodoOpResult } from "@/common/todos/ops";
import { todoBoardSchema } from "@/common/todos/schema";
import type { TodoBoard } from "@/common/todos/types";
import { isMissing, parseJson, type Report } from "../shared/fallback";

export class TodoStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly warn: Report,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID,
  ) {}

  read(): Promise<TodoBoard> {
    return this.serialized(() => this.load());
  }

  apply(op: TodoOp): Promise<TodoOpResult> {
    return this.transact((board) => applyTodoOp(board, op, { now: this.now(), newId: this.newId }));
  }

  /** Read-modify-write under the store's queue; returning the same board skips the write. */
  transact<T extends { board: TodoBoard }>(work: (board: TodoBoard) => T): Promise<T> {
    return this.serialized(async () => {
      const board = await this.load();
      const result = work(board);
      if (result.board !== board) await this.write(result.board);
      return result;
    });
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<TodoBoard> {
    const text = await readFile(this.file, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (text === null) return defaultBoard();
    const parsed = todoBoardSchema.safeParse(parseJson(text));
    if (parsed.success) return parsed.data;
    const backup = `${this.file}.${this.now()}.bak`;
    await rename(this.file, backup);
    this.warn("todos", new Error("todo file was unreadable; moved aside"), { backup });
    return defaultBoard();
  }

  private async write(board: TodoBoard): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(board, null, 2)}\n`);
    await rename(tmp, this.file);
  }
}
