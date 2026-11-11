import "server-only";
import { stat } from "node:fs/promises";
import path from "node:path";
import { isMissingPath } from "@/server/shared/ports";
import type { OrcaCli } from "./OrcaCli";

export type ProjectKind = "git" | "folder";

/** `.git` is a directory in a normal checkout and a file in a linked worktree or submodule. */
export async function kindOf(folder: string): Promise<ProjectKind> {
  return stat(path.join(folder, ".git")).then(
    () => "git",
    (error: unknown) => {
      if (isMissingPath(error)) return "folder";
      throw error;
    },
  );
}

export async function importProject(cli: OrcaCli, folder: string): Promise<ProjectKind> {
  const info = await stat(folder).catch((error: unknown) => {
    if (isMissingPath(error)) throw new Error(`폴더가 없어요: ${folder}`);
    throw error;
  });
  if (!info.isDirectory()) throw new Error(`폴더가 아니에요: ${folder}`);
  const kind = await kindOf(folder);
  await cli.run(["repo", "add", "--path", folder, "--kind", kind]);
  return kind;
}
