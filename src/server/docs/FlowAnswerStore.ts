import "server-only";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * The personal flow attachment `~/.config/flow/scripts/pull-app.py` reads this folder, so the path
 * and the file shape are a contract with that script.
 */
export const FLOW_ANSWERS_DIR =
  process.env.AGENT_CONTROL_FLOW_ANSWERS ?? path.join(homedir(), ".local", "share", "agent-control", "flow-answers");

interface FlowAnswerStoreOptions {
  dir?: string;
  isViewable: (file: string) => Promise<boolean>;
}

export type SaveResult = { ok: true; folder: string; count: number } | { ok: false; reason: "not-a-doc" | "bad-state" };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function answerCount(state: unknown): number | null {
  if (typeof state !== "object" || state === null || !("answers" in state)) return null;
  const { answers } = state;
  return typeof answers === "object" && answers !== null ? Object.keys(answers).length : null;
}

/** Mirrors what a flow page saved in the app's document panel, one file per page folder. */
export class FlowAnswerStore {
  private readonly dir: string;

  constructor(private readonly options: FlowAnswerStoreOptions) {
    this.dir = options.dir ?? FLOW_ANSWERS_DIR;
  }

  /** `page` is the absolute path of the HTML file; `state` the raw localStorage value, null when it was removed. */
  async save(page: string, state: string | null): Promise<SaveResult> {
    if (!(await this.options.isViewable(page))) return { ok: false, reason: "not-a-doc" };
    const folder = path.dirname(page) + "/";
    const file = path.join(this.dir, `${createHash("sha1").update(folder).digest("hex")}.json`);
    if (state === null) {
      await rm(file, { force: true });
      return { ok: true, folder, count: 0 };
    }
    const parsed = parseJson(state);
    const count = answerCount(parsed);
    if (count === null) return { ok: false, reason: "bad-state" };
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, JSON.stringify({ folder, state: parsed, savedAt: Date.now() }, null, 2));
    return { ok: true, folder, count };
  }
}
