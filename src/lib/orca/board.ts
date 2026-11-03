import { stat } from "node:fs/promises";
import { extractArtifacts } from "./artifacts";
import { loadFlowTasks } from "@/lib/workflow/flowDocs";
import { detectMode, getPullRequest } from "@/lib/workflow/git";
import { findFullMessage } from "@/lib/sessions/fullMessage";
import { runOrca } from "./cli";
import type {
  AgentCard,
  Artifact,
  AgentState,
  BoardSnapshot,
  ProjectSummary,
  WorktreeSummary,
  OrcaTerminalRaw,
  OrcaWorktreeRaw,
} from "./types";

const PREVIEW_LIMIT = 200;

async function fullMessageOf(message: string | null, agentType: string | null, cwd: string): Promise<string | null> {
  if (!message || agentType !== "claude") return message;
  if (message.includes("\n") || message.length > PREVIEW_LIMIT) return message;
  return (await findFullMessage(cwd, message).catch(() => null)) ?? message;
}

const KNOWN_STATES: readonly AgentState[] = ["working", "done", "blocked", "waiting", "idle"];

function toAgentState(value: string): AgentState {
  return KNOWN_STATES.find((state) => state === value) ?? "idle";
}

async function existing(artifacts: Artifact[]): Promise<Artifact[]> {
  const checks = await Promise.all(
    artifacts.map(async (artifact) => {
      if (artifact.kind === "artifact" || artifact.kind === "pr") return true;
      if (artifact.target.includes("*")) return false;
      return stat(artifact.target)
        .then((info) => info.isFile())
        .catch(() => false);
    }),
  );
  return artifacts.filter((_, index) => checks[index]);
}

function shortBranch(branch: string | null): string | null {
  return branch ? branch.replace(/^refs\/heads\//, "") : null;
}

export async function loadBoard(): Promise<BoardSnapshot> {
  const [ps, terminals] = await Promise.all([
    runOrca<{ worktrees: OrcaWorktreeRaw[] }>(["worktree", "ps", "--limit", "500"]),
    runOrca<{ terminals: OrcaTerminalRaw[] }>(["terminal", "list"]).catch(() => ({
      terminals: [],
    })),
  ]);

  const handleByPane = new Map<string, string>();
  for (const terminal of terminals.terminals) {
    handleByPane.set(`${terminal.tabId}:${terminal.leafId}`, terminal.handle);
  }

  const agents: AgentCard[] = [];
  const worktrees: WorktreeSummary[] = [];
  const repoPaths = new Map<string, string>();

  for (const worktree of ps.worktrees) {
    if (worktree.isArchived) continue;
    const branch = shortBranch(worktree.branch);
    if (!repoPaths.has(worktree.repo) || worktree.isMainWorktree) {
      repoPaths.set(worktree.repo, worktree.path);
    }
    worktrees.push({
      worktreeId: worktree.worktreeId,
      repo: worktree.repo,
      name: worktree.displayName ?? branch ?? worktree.path,
      branch,
      path: worktree.path,
      unread: worktree.unread,
      lastActivityAt: worktree.lastActivityAt,
      flowTasks: await loadFlowTasks(worktree.path, branch),
      pullRequest: getPullRequest(worktree.path, branch),
    });
    for (const agent of worktree.agents) {
      if (agent.parentPaneKey) continue;
      const backgroundRunning =
        agent.workingMode === "monitoring" && agent.mainAgent != null && agent.mainAgent.state !== "working";
      const effectiveState = backgroundRunning && agent.mainAgent ? agent.mainAgent.state : agent.state;
      const lastMessage = await fullMessageOf(agent.lastAssistantMessage, agent.agentType, worktree.path);
      const effectiveSince =
        backgroundRunning && agent.mainAgent ? agent.mainAgent.stateStartedAt : agent.stateStartedAt;
      agents.push({
        id: agent.paneKey,
        worktreeId: worktree.worktreeId,
        repo: worktree.repo,
        worktreeName: worktree.displayName ?? branch ?? worktree.path,
        branch,
        worktreePath: worktree.path,
        agentType: agent.agentType,
        state: toAgentState(effectiveState),
        prompt: agent.prompt,
        title: agent.taskTitle ?? agent.displayName,
        lastMessage,
        toolName: agent.toolName,
        backgroundRunning,
        interrupted: agent.interrupted,
        stateSince: effectiveSince,
        updatedAt: agent.updatedAt,
        unread: worktree.unread,
        terminalHandle: handleByPane.get(agent.paneKey) ?? null,
        artifacts: await existing(extractArtifacts(lastMessage, worktree.path)),
      });
    }
  }

  const projects: ProjectSummary[] = await Promise.all(
    [...repoPaths.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([repo, repoPath]) => ({ repo, autoMode: await detectMode(repoPath) })),
  );

  return { fetchedAt: Date.now(), projects, worktrees, agents };
}
