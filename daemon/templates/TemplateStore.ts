import { readFile } from "node:fs/promises";
import { templateOf, templatesOf, type WorkflowTemplate } from "../../src/common/templates/types.ts";

export const TEMPLATES_FILE = "templates.json";

export interface TemplateStoreDeps {
  file: string;
  write: (file: string, body: string) => Promise<void>;
  read?: (file: string) => Promise<string>;
  now?: () => number;
}

export class TemplateStore {
  #deps: Required<TemplateStoreDeps>;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(deps: TemplateStoreDeps) {
    this.#deps = { read: (file) => readFile(file, "utf8"), now: Date.now, ...deps };
  }

  async list(): Promise<WorkflowTemplate[]> {
    try {
      return templatesOf(JSON.parse(await this.#deps.read(this.#deps.file)));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) console.error("[templates] unreadable", this.#deps.file, error);
      return [];
    }
  }

  async get(id: string): Promise<WorkflowTemplate | null> {
    return (await this.list()).find((template) => template.id === id) ?? null;
  }

  save(value: unknown): Promise<WorkflowTemplate | null> {
    const template = templateOf(value);
    if (!template) return Promise.resolve(null);
    const saved = { ...template, updatedAt: this.#deps.now() };
    return this.#update((list) => [...list.filter((item) => item.id !== saved.id), saved]).then(() => saved);
  }

  remove(id: string): Promise<boolean> {
    return this.#update((list) => list.filter((item) => item.id !== id)).then((before) => before.some((item) => item.id === id));
  }

  #update(change: (list: WorkflowTemplate[]) => WorkflowTemplate[]): Promise<WorkflowTemplate[]> {
    const next = this.#queue.then(async () => {
      const before = await this.list();
      await this.#deps.write(this.#deps.file, `${JSON.stringify({ templates: change(before) }, null, 2)}\n`);
      return before;
    });
    this.#queue = next.catch(() => {});
    return next;
  }
}
