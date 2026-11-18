import { z } from "zod";

export const COMMAND_NAME_LIMIT = 40;
export const COMMAND_LINE_LIMIT = 500;
export const MAX_PROJECT_COMMANDS = 20;
export const COMMAND_REQUEST_LIMIT = 500;

const oneLine = (limit: number) =>
  z
    .string()
    .max(limit)
    .refine((value) => value.trim().length > 0 && !/[\r\n]/.test(value));

export const projectCommandSchema = z.object({
  name: oneLine(COMMAND_NAME_LIMIT),
  command: oneLine(COMMAND_LINE_LIMIT),
});

export type ProjectCommand = z.infer<typeof projectCommandSchema>;

export const projectCommandsSchema = z.array(projectCommandSchema).max(MAX_PROJECT_COMMANDS);

export interface CommandProposal extends ProjectCommand {
  why: string;
}

export interface ProjectCommandsEntry {
  projectPath: string;
  commands: ProjectCommand[];
}

export interface BranchStatus {
  path: string;
  branch: string | null;
  commit: string | null;
  mainCommit: string | null;
  behind: number | null;
}

export interface AppBuildInfo {
  commit: string;
  branch: string | null;
  builtAt: number;
}

export interface DaemonInfo {
  commit: string | null;
  pid: number;
  startedAt: number;
}

export type DaemonRestartState =
  | { kind: "idle" }
  | { kind: "scheduled"; requestedAt: number }
  | { kind: "restarting" }
  | { kind: "failed"; message: string };

// commit is the build this server started from; installedCommit is what ~/Applications holds now.
// They differ when a new build was installed but the running app was never restarted.
export type AppSide =
  | { kind: "built"; commit: string; branch: string | null; builtAt: number; installedCommit: string | null }
  | { kind: "dev" };

export type AppBuildPhase = "building" | "installing" | "relaunching";

export type AppBuildJob =
  | { kind: "none" }
  | { kind: "running"; phase: AppBuildPhase; commit: string | null; startedAt: number }
  | { kind: "stopped"; phase: AppBuildPhase; commit: string | null; startedAt: number }
  | { kind: "failed"; phase: AppBuildPhase; commit: string | null; message: string; finishedAt: number }
  | { kind: "done"; commit: string | null; finishedAt: number };

export type DaemonSide = { kind: "running"; commit: string | null; startedAt: number | null } | { kind: "down" };

export interface AppStatus {
  repoPath: string;
  checkout: BranchStatus;
  app: AppSide;
  daemon: DaemonSide;
  workingSessions: number;
  restart: DaemonRestartState;
  build: AppBuildJob;
}

export interface AppMismatch {
  app: boolean;
  daemon: boolean;
  any: boolean;
}

export function mismatchOf(status: AppStatus): AppMismatch {
  const main = status.checkout.mainCommit;
  const app = status.app.kind === "built" && main !== null && status.app.commit !== main;
  const daemon = status.daemon.kind === "down" || (main !== null && status.daemon.commit !== main);
  return { app, daemon, any: app || daemon };
}

export function shortSha(commit: string | null): string {
  return commit ? commit.slice(0, 7) : "알 수 없음";
}

export const APP_BUILD_COMMAND = "node scripts/apply-app.mjs";

export const appStatusActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("build-app") }),
  z.object({ type: z.literal("restart-daemon"), when: z.enum(["now", "idle"]) }),
  z.object({ type: z.literal("cancel-restart") }),
]);

export type AppStatusAction = z.infer<typeof appStatusActionSchema>;

export type AppStatusResponse = { ok: true; status: AppStatus } | { ok: false; error: string };

const absolutePath = z.string().refine((value) => value.startsWith("/"), "absolute path required");

export const projectCommandsRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("propose"), projectPath: absolutePath }),
  z.object({ type: z.literal("revise"), projectPath: absolutePath, request: oneLine(COMMAND_REQUEST_LIMIT) }),
  z.object({ type: z.literal("save"), projectPath: absolutePath, commands: projectCommandsSchema }),
]);

export type ProjectCommandsRequest = z.infer<typeof projectCommandsRequestSchema>;

export type ProjectCommandsListResponse = { ok: true; projects: ProjectCommandsEntry[] } | { ok: false; error: string };

export type ProjectCommandsProposalResponse = { ok: true; proposals: CommandProposal[] } | { ok: false; error: string };

export type BranchStatusResponse = { ok: true; status: BranchStatus } | { ok: false; error: string };
