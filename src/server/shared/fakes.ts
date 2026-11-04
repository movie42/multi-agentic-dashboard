import "server-only";
import path from "node:path";
import type { DirEntry, ExecFileFn, ExecFileOptions, FileSystemPort } from "./ports";

export interface FakeFile {
  content: string;
  mtimeMs?: number;
}

function missing(target: string): Error {
  return Object.assign(new Error(`ENOENT: ${target}`), { code: "ENOENT" });
}

export function fakeFileSystem(files: Record<string, FakeFile>): FileSystemPort & { reads: string[] } {
  const reads: string[] = [];
  const isDir = (target: string) => Object.keys(files).some((file) => file.startsWith(`${target}/`));
  return {
    reads,
    async stat(target) {
      const file = files[target];
      if (file) return { mtimeMs: file.mtimeMs ?? 1, isFile: () => true };
      if (isDir(target)) return { mtimeMs: 0, isFile: () => false };
      throw missing(target);
    },
    async readFile(target) {
      const file = files[target];
      if (!file) throw missing(target);
      reads.push(target);
      return file.content;
    },
    async readdir(target) {
      if (!isDir(target)) throw missing(target);
      const names = [
        ...new Set(
          Object.keys(files)
            .filter((file) => file.startsWith(`${target}/`))
            .map((file) => path.relative(target, file).split("/")[0]),
        ),
      ];
      return names.map((name): DirEntry => ({ name, isDirectory: () => isDir(path.join(target, name)) }));
    },
  };
}

export interface ExecCall {
  file: string;
  args: string[];
  options?: ExecFileOptions;
}

export type ExecHandler = (call: ExecCall) => string | Error | Promise<string | Error>;

export function fakeExecFile(handler: ExecHandler): ExecFileFn & { calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  const fn = async (file: string, args: string[], options?: ExecFileOptions) => {
    const call = { file, args, options };
    calls.push(call);
    const result = await handler(call);
    if (result instanceof Error) throw result;
    return { stdout: result, stderr: "" };
  };
  return Object.assign(fn, { calls });
}

export function execError(message: string, fields: { stdout?: string; stderr?: string; code?: number | string }): Error {
  return Object.assign(new Error(message), { stdout: "", stderr: "", ...fields });
}
