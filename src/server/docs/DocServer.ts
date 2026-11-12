import "server-only";
import { readFile, realpath } from "node:fs/promises";
import { isMissingPath } from "@/server/shared/ports";
import { resolveDocPath } from "./docPath";
import { injectLinkScript } from "./injectLinkScript";

export type DocFile =
  | { ok: true; body: string | Uint8Array<ArrayBuffer>; contentType: string }
  | { ok: false; status: 403 | 404 };

interface DocServerOptions {
  worktreePaths: (options?: { fresh?: boolean }) => Promise<string[]>;
}

export class DocServer {
  constructor(private readonly options: DocServerOptions) {}

  async read(requested: string): Promise<DocFile> {
    const result = await this.resolve(requested).catch((error: unknown) => {
      if (isMissingPath(error)) return null;
      throw error;
    });
    if (result === null) return { ok: false, status: 404 };
    if (!result.ok) return { ok: false, status: 403 };
    if (result.contentType.startsWith("text/html")) {
      return { ok: true, body: injectLinkScript(await readFile(result.file, "utf8")), contentType: result.contentType };
    }
    return { ok: true, body: new Uint8Array(await readFile(result.file)), contentType: result.contentType };
  }

  async isViewable(requested: string): Promise<boolean> {
    const result = await this.resolve(requested).catch((error: unknown) => {
      if (isMissingPath(error)) return null;
      throw error;
    });
    return result?.ok === true;
  }

  // A worktree created after the last board load is not in the cached list yet.
  private async resolve(requested: string) {
    const cached = await resolveDocPath(requested, await this.options.worktreePaths(), realpath);
    if (cached.ok || cached.reason === "type") return cached;
    return resolveDocPath(requested, await this.options.worktreePaths({ fresh: true }), realpath);
  }
}
