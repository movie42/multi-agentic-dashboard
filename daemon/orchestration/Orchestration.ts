import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  GRANT_BUNDLES,
  type ConductorScope,
  type GrantBundle,
  type LaunchConductorRequest,
  type LinkKind,
  type OrchestrationState,
} from "../../src/common/orchestration/types.ts";
import type { RunnerSession } from "../../src/common/runner/types.ts";
import type { PermissionRequestInput } from "../session/permissions.ts";
import type { SessionRegistry } from "../session/SessionRegistry.ts";
import { handleMcpMessage, type ScopedWorktree } from "./conductorMcp.ts";
import { grantFor, isDelegated } from "./grants.ts";
import { readLastAnswer } from "./lastAnswer.ts";
import { OrchestrationStore } from "./OrchestrationStore.ts";
import { RuleRunner } from "./RuleRunner.ts";

const execFileAsync = promisify(execFile);

export interface OrchestrationOptions {
  registry: SessionRegistry;
  /** worktrees.json in the dashboard's data folder: display names and parent worktrees. */
  worktreeMetaFile: string;
  onChange: (state: OrchestrationState) => void;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

const LINKS_PATH = "/orchestration/links";
const LINK_PATH = /^\/orchestration\/links\/([^/]+)$/;
const LINK_RESUME_PATH = /^\/orchestration\/links\/([^/]+)\/resume$/;
const CONDUCTORS_PATH = "/orchestration/conductors";
const GRANT_PATH = /^\/orchestration\/conductors\/([^/]+)\/grants$/;
const PROPOSAL_PATH = /^\/orchestration\/proposals\/([^/]+)$/;
const PROPOSAL_ACCEPT_PATH = /^\/orchestration\/proposals\/([^/]+)\/accept$/;
export const MCP_PATH = /^\/mcp\/([^/]+)$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

const LINK_KINDS: readonly LinkKind[] = ["delegate", "report", "next"];

export function parseWorktreeList(stdout: string): ScopedWorktree[] {
  return stdout.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split("\n");
    const target = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (!target || lines.some((line) => line === "bare" || line.startsWith("prunable"))) return [];
    const ref = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length) ?? null;
    return [{ path: target, branch: ref ? ref.replace(/^refs\/heads\//, "") : null }];
  });
}

/** The root worktree and every worktree branched from it, following `parentPath` in worktrees.json. */
export function descendantsOf(root: string, all: ScopedWorktree[], parentOf: ReadonlyMap<string, string>): ScopedWorktree[] {
  const inScope = new Set([root]);
  // eslint-disable-next-line no-restricted-syntax -- fixed-point loop flag
  for (let grew = true; grew; ) {
    grew = false;
    for (const worktree of all) {
      const parent = parentOf.get(worktree.path);
      if (!inScope.has(worktree.path) && parent && inScope.has(parent)) {
        inScope.add(worktree.path);
        grew = true;
      }
    }
  }
  return all.filter((worktree) => inScope.has(worktree.path));
}

export function permissionMessage(workerId: string, worker: RunnerSession | null, requestId: string, input: PermissionRequestInput): string {
  const where = worker ? path.basename(worker.cwd) : "";
  const detail = JSON.stringify(input.toolInput).slice(0, 600);
  return [
    `[Agent Control] 권한 요청 — 세션 ${workerId}${where ? ` (${where})` : ""}`,
    `도구: ${input.toolName}`,
    `내용: ${detail}`,
    `answer_permission(session_id: "${workerId}", request_id: "${requestId}", decision: "allow" | "deny" | "ask_human")로 답해 주세요.`,
  ].join("\n");
}

export class Orchestration {
  readonly store: OrchestrationStore;
  readonly rules: RuleRunner;
  #registry: SessionRegistry;
  #metaFile: string;

  constructor(options: OrchestrationOptions) {
    this.#registry = options.registry;
    this.#metaFile = options.worktreeMetaFile;
    this.store = new OrchestrationStore({ onChange: options.onChange });
    this.rules = new RuleRunner({
      store: this.store,
      sessions: { get: (id) => options.registry.get(id), write: (id, data) => options.registry.write(id, data) },
      readAnswer: readLastAnswer,
    });
  }

  async worktreesOf(scope: ConductorScope): Promise<ScopedWorktree[]> {
    const { stdout } = await execFileAsync("git", ["-C", scope.root, "worktree", "list", "--porcelain"], { timeout: 10_000 });
    const all = parseWorktreeList(stdout);
    if (scope.kind === "project") return all;
    return descendantsOf(scope.root, all, await this.#parents());
  }

  async #parents(): Promise<Map<string, string>> {
    try {
      const worktrees = record(record(JSON.parse(await readFile(this.#metaFile, "utf8")))?.worktrees) ?? {};
      return new Map(
        Object.entries(worktrees).flatMap(([worktreePath, entry]): [string, string][] => {
          const parent = record(entry)?.parentPath;
          return typeof parent === "string" ? [[worktreePath, parent]] : [];
        }),
      );
    } catch {
      return new Map();
    }
  }

  noteHook(sessionId: string, event: string, body: unknown): void {
    this.rules.noteHook(sessionId, event, body).catch((error: unknown) => console.error("[orchestration] hook failed", sessionId, event, error));
  }

  /** Whether a permission request from this session goes to a conductor before a person. */
  delegates(sessionId: string, input: PermissionRequestInput): boolean {
    const conductor = this.store.conductorOf(sessionId);
    const worker = this.#registry.get(sessionId);
    return Boolean(conductor && worker && isDelegated(conductor, input, worker.cwd));
  }

  onPermissionHeld(sessionId: string, requestId: string, input: PermissionRequestInput): void {
    if (!this.delegates(sessionId, input)) return;
    const conductor = this.store.conductorOf(sessionId);
    if (!conductor || !this.#registry.delegatePermission(sessionId, requestId, conductor.sessionId)) return;
    this.rules.deliver(conductor.sessionId, permissionMessage(sessionId, this.#registry.get(sessionId), requestId, input));
  }

  launchConductor(request: LaunchConductorRequest): RunnerSession {
    const session = this.#registry.launch({ cwd: request.cwd, prompt: request.prompt || undefined, conductor: true });
    this.store.addConductor({ sessionId: session.id, scope: request.scope, grants: request.grants, extraGrants: [] });
    return session;
  }

  async mcp(conductorId: string, body: unknown): Promise<unknown | null> {
    return handleMcpMessage(conductorId, body, {
      store: this.store,
      sessions: {
        list: () => this.#registry.list(),
        get: (id) => this.#registry.get(id),
        launch: (request) => this.#registry.launch(request),
        answerPermission: (id, requestId, answer) => this.#registry.answerPermission(id, requestId, answer),
      },
      rules: this.rules,
      worktreesOf: (scope) => this.worktreesOf(scope),
    });
  }

  /** HTTP routes under /orchestration for the dashboard; null when the path is not one of them. */
  async route(method: string, pathname: string, body: () => Promise<unknown>): Promise<RouteResult | null> {
    const ok = (extra: Record<string, unknown> = {}): RouteResult => ({ status: 200, body: { ok: true, orchestration: this.store.state(), ...extra } });
    const fail = (status: number, error: string): RouteResult => ({ status, body: { ok: false, error } });

    if (pathname === "/orchestration" && method === "GET") return ok();

    if (pathname === LINKS_PATH && method === "POST") {
      const raw = record(await body());
      const from = raw?.from;
      const to = raw?.to;
      const kind = LINK_KINDS.find((candidate) => candidate === raw?.kind);
      if (typeof from !== "string" || typeof to !== "string" || !kind) return fail(400, "잇는 두 세션과 선 종류가 필요해요.");
      if (!this.#registry.get(from) || !this.#registry.get(to)) return fail(404, "세션이 없어요.");
      try {
        this.store.addLink({ from, to, kind }, "user");
      } catch (error) {
        return fail(400, error instanceof Error ? error.message : String(error));
      }
      return ok();
    }

    const resume = LINK_RESUME_PATH.exec(pathname);
    if (resume && method === "POST") return this.store.resumeLink(decodeURIComponent(resume[1] ?? "")) ? ok() : fail(404, "선이 없어요.");

    const link = LINK_PATH.exec(pathname);
    if (link && method === "DELETE") return this.store.removeLink(decodeURIComponent(link[1] ?? "")) ? ok() : fail(404, "선이 없어요.");

    if (pathname === CONDUCTORS_PATH && method === "POST") {
      const raw = record(await body());
      const scope = record(raw?.scope);
      const cwd = raw?.cwd;
      const root = scope?.root;
      if (typeof cwd !== "string" || !cwd.startsWith("/") || typeof root !== "string" || !root.startsWith("/")) return fail(400, "지휘자를 띄울 폴더와 범위가 필요해요.");
      const grants = Array.isArray(raw?.grants) ? raw.grants.flatMap((grant): GrantBundle[] => GRANT_BUNDLES.filter((bundle) => bundle === grant)) : [];
      const session = this.launchConductor({
        cwd,
        scope: { kind: scope?.kind === "worktree" ? "worktree" : "project", root },
        grants,
        prompt: typeof raw?.prompt === "string" ? raw.prompt : "",
      });
      return ok({ session });
    }

    const grant = GRANT_PATH.exec(pathname);
    if (grant && method === "POST") {
      const workerId = record(await body())?.workerId;
      const conductorId = decodeURIComponent(grant[1] ?? "");
      const permission = typeof workerId === "string" ? this.#registry.get(workerId)?.permission : null;
      const added = permission ? grantFor(permission) : null;
      if (!added) return fail(400, "지휘자에게 맡길 수 없는 요청이에요.");
      return this.store.addExtraGrant(conductorId, added) ? ok({ grant: added }) : fail(404, "지휘자가 없어요.");
    }

    const accept = PROPOSAL_ACCEPT_PATH.exec(pathname);
    if (accept && method === "POST") {
      const cwd = record(await body())?.cwd;
      const proposal = this.store.takeProposal(decodeURIComponent(accept[1] ?? ""));
      if (!proposal) return fail(404, "제안이 없어요.");
      if (typeof cwd !== "string" || !cwd.startsWith("/")) return fail(400, "만든 워크트리 경로가 필요해요.");
      const worker = this.#registry.launch({ cwd, prompt: proposal.prompt || undefined });
      this.store.addLink({ from: proposal.conductorId, to: worker.id, kind: "delegate" }, "conductor");
      this.store.addLink({ from: worker.id, to: proposal.conductorId, kind: "report" }, "conductor");
      this.rules.deliver(proposal.conductorId, `[Agent Control] 제안한 워크트리 ${proposal.name}을 만들고 세션 ${worker.id}을 열었어요.`);
      return ok({ session: worker });
    }

    const proposal = PROPOSAL_PATH.exec(pathname);
    if (proposal && method === "DELETE") {
      const taken = this.store.takeProposal(decodeURIComponent(proposal[1] ?? ""));
      if (!taken) return fail(404, "제안이 없어요.");
      this.rules.deliver(taken.conductorId, `[Agent Control] 워크트리 제안 ${taken.name}은 사람이 거절했어요.`);
      return ok();
    }

    return null;
  }
}
