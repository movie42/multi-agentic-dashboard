import "server-only";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

export interface ExecFileOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFileFn = (file: string, args: string[], options?: ExecFileOptions) => Promise<ExecFileResult>;

export type ReportFn = (scope: string, error: unknown, context?: Record<string, unknown>) => void;

const execFileAsync = promisify(execFile);

export const nodeExecFile: ExecFileFn = async (file, args, options = {}) => {
  const { stdout, stderr } = await execFileAsync(file, args, { ...options, encoding: "utf8" });
  return { stdout, stderr };
};

export function errorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

export function errorField(error: unknown, field: "stdout" | "stderr"): string {
  return typeof error === "object" && error !== null && field in error
    ? String(Reflect.get(error, field))
    : "";
}

export function isMissingPath(error: unknown): boolean {
  const code = errorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

export interface FileInfo {
  mtimeMs: number;
  isFile(): boolean;
}

export interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

export interface FileSystemPort {
  stat(target: string): Promise<FileInfo>;
  readFile(target: string): Promise<string>;
  readdir(target: string): Promise<DirEntry[]>;
}

export const nodeFileSystem: FileSystemPort = {
  stat: (target) => stat(target),
  readFile: (target) => readFile(target, "utf8"),
  readdir: (target) => readdir(target, { withFileTypes: true }),
};

export async function pathExists(fs: FileSystemPort, target: string, warn: ReportFn, scope: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    (error: unknown) => {
      if (!isMissingPath(error)) warn(scope, error, { target });
      return false;
    },
  );
}

export async function listDir(fs: FileSystemPort, target: string, warn: ReportFn, scope: string): Promise<DirEntry[]> {
  return fs.readdir(target).catch((error: unknown) => {
    if (!isMissingPath(error)) warn(scope, error, { target });
    return [];
  });
}

export function exitCode(error: unknown): number | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "number"
    ? error.code
    : null;
}
