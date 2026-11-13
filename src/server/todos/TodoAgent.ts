import "server-only";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { AgentCard, BoardSnapshot, WorktreeSummary } from "@/common/board/types";
import { TodoRuleError } from "@/common/todos/board";
import {
  AGENT_OP_TYPES,
  describeAgentOp,
  prepareAgentSteps,
  type AgentFailure,
  type AgentSessionFact,
  type TodoAgentTurn,
} from "@/common/todos/agentTurn";
import type { TodoOp, TodoOpResult } from "@/common/todos/ops";
import type { TodoBoard } from "@/common/todos/types";
import { resolveClaudeBin } from "@/server/intentDiff/AskRunner";
import { clip } from "@/server/sessions/transcriptText";
import type { ScannedSession } from "@/server/sessions/summarize";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 3 * 60_000;
const MODEL = process.env.TODO_DRAFT_MODEL ?? "sonnet";
const MAX_OPEN_SESSIONS = 30;
const MAX_SEARCH_HITS = 25;
const MAX_SEARCH_ROUNDS = 3;
const MAX_CONVERSATIONS = 10;
const MAX_OPS = 30;
const TEXT_LIMIT = 600;
const MEMO_PREVIEW = 400;

const RULES = `You are the to-do assistant inside the Agent Control dashboard. You talk with the user in Korean and change their to-do board for them: create cards, edit a card's title, memo, status, Jira links, project or worktree, attach or detach Claude Code sessions, and delete cards. What you put in "ops" is applied to the board right away and shown to the user as a list of changes.
- Every message carries the current board in <board>: statuses (with what each means), and every card with its id, title, statusId, memo preview, Jira links, project, worktree and session ids. The first message also lists the open sessions no card holds yet. There may be none.
- Change only what the user asked for. When the request is ambiguous, leave "ops" empty and ask one question in "reply". Delete a card only when the user clearly asks to delete it.
- Past sessions are not shown up front. To find them, put keywords in "search" (try Korean and English variants, Jira keys, branch or project names). The dashboard answers in the next message with matching sessions, newest first. While "search" is not empty, "ops" is ignored; return the ops in the response where "search" is empty. You get at most ${MAX_SEARCH_ROUNDS} searches per user message.
- A search result is not a match just because it contains a keyword. Keep only sessions really about what the user asked.
- Use only session ids you were shown. A session belongs to one card; attaching it to a card detaches it from any other.
- Each op has a "type" and only the fields that type takes; leave the other fields out:
  - "card-create": title, optional memo, statusId, sessionIds, jiraUrls. Project and worktree come from the sessions unless you set repo or worktreePath.
  - "card-update": cardId and only the fields to change among title, memo, jiraUrls (the full list after the change), repo, worktreePath. A memo you send replaces the whole memo, so keep what should stay.
  - "card-move": cardId, statusId.
  - "card-delete": cardId.
  - "session-attach" / "session-detach": cardId, sessionId.
- Several sessions doing the same piece of work go on one card. If the work clearly belongs to an existing card, attach to that card instead of creating a new one.
- "title": one Korean line naming the remaining work, not the session. Keep Jira keys or branch names when they identify the work.
- "memo": short Korean markdown — what the work is, where it stopped, what is left. At most 6 lines for a new card. Do not invent facts.
- "statusId": pick from the statuses by their description. Use the first status when unsure.
- "reply": one to three Korean sentences on what you found or changed, or one question when you need the user to decide.`;

const SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    reply: { type: "string" },
    search: { type: "array", items: { type: "string" }, maxItems: 8 },
    ops: {
      type: "array",
      maxItems: MAX_OPS,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: AGENT_OP_TYPES },
          cardId: { type: "string" },
          title: { type: "string" },
          memo: { type: "string" },
          statusId: { type: "string" },
          sessionId: { type: "string" },
          sessionIds: { type: "array", items: { type: "string" } },
          jiraUrls: { type: "array", items: { type: "string" } },
          repo: { type: ["string", "null"] },
          worktreePath: { type: ["string", "null"] },
        },
        required: ["type"],
      },
    },
  },
  required: ["reply", "search", "ops"],
});

// No tools and no MCP servers: the agent only reads what the dashboard hands it, and the dashboard applies its ops.
const ARGS = [
  "--tools",
  "",
  "--strict-mcp-config",
  "--mcp-config",
  '{"mcpServers":{}}',
  "--model",
  MODEL,
  "--append-system-prompt",
  RULES,
  "--json-schema",
  SCHEMA,
  "--output-format",
  "json",
];

export interface AgentRunResult {
  conversationId: string;
  output: unknown;
}

export type RunTodoAgent = (prompt: string, conversationId: string | null) => Promise<AgentRunResult>;

interface TodoAgentDeps {
  loadBoard: () => Promise<Pick<BoardSnapshot, "agents" | "worktrees">>;
  listSessions: () => Promise<ScannedSession[]>;
  todos: {
    read: () => Promise<TodoBoard>;
    apply: (op: TodoOp) => Promise<TodoOpResult>;
  };
  runAgent?: RunTodoAgent;
}

export interface AgentMessage {
  conversationId: string | null;
  message: string;
}

interface TurnContext {
  board: TodoBoard;
  agents: AgentCard[];
  worktrees: WorktreeSummary[];
  facts: Map<string, AgentSessionFact>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function execClaude(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(resolveClaudeBin(), [...args, ...ARGS], {
      cwd: tmpdir(),
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const stderr = isRecord(error) && typeof error.stderr === "string" ? error.stderr.trim() : "";
    console.error("[todo-agent] claude failed", stderr);
    throw new Error(stderr.split("\n").pop() || "에이전트를 실행하지 못했어요");
  }
}

async function runClaude(prompt: string, conversationId: string | null): Promise<AgentRunResult> {
  const stdout = await execClaude(["-p", prompt, ...(conversationId ? ["--resume", conversationId] : [])]);
  const messages: unknown = JSON.parse(stdout);
  const result = Array.isArray(messages) ? messages.find((message) => isRecord(message) && message.type === "result") : messages;
  if (!isRecord(result) || typeof result.session_id !== "string") throw new Error("에이전트 응답을 읽지 못했어요");
  if (result.is_error === true) throw new Error(typeof result.result === "string" ? result.result : "에이전트가 실패했어요");
  return {
    conversationId: result.session_id,
    output: result.structured_output,
  };
}

function holderOf(board: TodoBoard): Map<string, string> {
  return new Map(board.cards.flatMap((card) => card.sessionIds.map((id) => [id, card.id] as const)));
}

export function unattachedSessions(agents: readonly AgentCard[], board: TodoBoard): AgentCard[] {
  const held = holderOf(board);
  const seen = new Set<string>();
  return agents.filter((agent) => {
    const id = agent.session?.id;
    if (!id || held.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function openFact(agent: AgentCard, summary: ScannedSession | undefined): AgentSessionFact {
  return {
    id: agent.session?.id ?? "",
    open: true,
    cardId: null,
    repo: agent.repo,
    worktreeName: agent.worktreeName,
    worktreePath: agent.worktreePath,
    branch: agent.branch,
    state: agent.state,
    title: agent.session?.title ?? agent.title ?? summary?.title ?? null,
    firstPrompt: clip(summary?.firstPrompt ?? agent.prompt, TEXT_LIMIT),
    lastPrompt: clip(summary?.lastPrompt ?? null, TEXT_LIMIT),
    lastMessage: clip(agent.lastMessage ?? summary?.lastMessage ?? null, TEXT_LIMIT),
    updatedAt: summary?.updatedAt ?? agent.updatedAt,
  };
}

/** Transcripts only know their folder; a worktree still on the board gives the real repo and name. */
function worktreeAt(worktrees: readonly WorktreeSummary[], cwd: string | null): WorktreeSummary | undefined {
  if (!cwd) return undefined;
  return worktrees.find((worktree) => cwd === worktree.path || cwd.startsWith(`${worktree.path}/`));
}

function pastFact(
  summary: ScannedSession,
  agent: AgentCard | undefined,
  worktree: WorktreeSummary | undefined,
  cardId: string | null,
): AgentSessionFact {
  if (agent) return { ...openFact(agent, summary), cardId };
  return {
    id: summary.sessionId,
    open: false,
    cardId,
    repo: worktree?.repo ?? summary.project,
    worktreeName: worktree?.name ?? null,
    worktreePath: worktree?.path ?? (summary.cwdExists ? summary.cwd : null),
    branch: summary.gitBranch,
    state: "closed",
    title: summary.title,
    firstPrompt: clip(summary.firstPrompt, TEXT_LIMIT),
    lastPrompt: clip(summary.lastPrompt, TEXT_LIMIT),
    lastMessage: clip(summary.lastMessage, TEXT_LIMIT),
    updatedAt: summary.updatedAt,
  };
}

function haystackOf(summary: ScannedSession): string {
  return [summary.title, summary.project, summary.gitBranch, summary.cwd, summary.firstPrompt, summary.lastPrompt, summary.lastMessage]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/** Sessions matching the most keywords first, newest first among equals. Headless runs (this agent's own included) are left out. */
export function searchSessions(sessions: readonly ScannedSession[], keywords: readonly string[]): ScannedSession[] {
  const terms = [...new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter((keyword) => keyword.length > 1))];
  if (terms.length === 0) return [];
  return sessions
    .filter((session) => session.origin !== "headless")
    .map((session) => {
      const haystack = haystackOf(session);
      return {
        session,
        score: terms.filter((term) => haystack.includes(term)).length,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.session.updatedAt - a.session.updatedAt)
    .slice(0, MAX_SEARCH_HITS)
    .map(({ session }) => session);
}

function boardBlock(board: TodoBoard): Record<string, unknown> {
  return {
    statuses: board.statuses.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
    cards: board.cards.map((card) => ({
      id: card.id,
      title: card.title,
      statusId: card.statusId,
      memo: clip(card.memo || null, MEMO_PREVIEW),
      jiraUrls: card.jira.map((jira) => jira.url),
      repo: card.repo,
      worktreePath: card.worktreePath,
      sessionIds: card.sessionIds,
      hidden: card.hidden,
    })),
  };
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === "string" && each.trim().length > 0) : [];
}

export class TodoAgent {
  private readonly runAgent: RunTodoAgent;
  /** Every session a conversation has shown the agent, so later turns can still attach them. */
  private readonly factsByConversation = new Map<string, Map<string, AgentSessionFact>>();

  constructor(private readonly deps: TodoAgentDeps) {
    this.runAgent = deps.runAgent ?? runClaude;
  }

  async send({ conversationId, message }: AgentMessage): Promise<TodoAgentTurn> {
    const known = conversationId ? this.factsByConversation.get(conversationId) : undefined;
    if (conversationId && !known) throw new Error("대화가 만료됐어요. 새로 시작해 주세요");
    const [board, { agents, worktrees }] = await Promise.all([this.deps.todos.read(), this.deps.loadBoard()]);
    const context: TurnContext = {
      board,
      agents,
      worktrees,
      facts: new Map(known),
    };

    const opening = known ? {} : { openSessions: await this.openSessions(context) };
    const first = await this.runAgent(`${message}\n\n<board>${JSON.stringify({ ...boardBlock(board), ...opening })}</board>`, conversationId);
    const result = await this.searchLoop(first, context);
    this.remember(result.conversationId, context.facts);

    const { changes, failures } = await this.applyOps(result.output, context.facts);
    const reply = isRecord(result.output) && typeof result.output.reply === "string" ? result.output.reply.trim() : "";
    return {
      conversationId: result.conversationId,
      reply: reply || (changes.length > 0 ? "보드를 바꿨어요." : "답을 만들지 못했어요."),
      changes,
      failures,
    };
  }

  /** Steps run one by one against the latest board, so one refused step leaves the others applied. */
  private async applyOps(output: unknown, facts: Map<string, AgentSessionFact>): Promise<{ changes: string[]; failures: AgentFailure[] }> {
    const { steps, failures } = prepareAgentSteps(output, await this.deps.todos.read(), [...facts.values()]);
    const sessionTitle = (id: string) => facts.get(id)?.title ?? id.slice(0, 8);
    const changes: string[] = [];
    for (const { op, jiraUrls } of steps.slice(0, MAX_OPS)) {
      const summary = describeAgentOp(await this.deps.todos.read(), op, sessionTitle);
      try {
        const { createdId } = await this.deps.todos.apply(op);
        if (jiraUrls && createdId) await this.deps.todos.apply({ type: "card-update", cardId: createdId, jiraUrls });
        changes.push(summary);
      } catch (error) {
        if (!(error instanceof TodoRuleError)) throw error;
        failures.push({ summary, error: error.message });
      }
    }
    return { changes, failures };
  }

  private async openSessions({ board, agents, facts }: TurnContext): Promise<AgentSessionFact[]> {
    const open = unattachedSessions(agents, board).slice(0, MAX_OPEN_SESSIONS);
    const summaries = new Map((await this.deps.listSessions()).map((summary) => [summary.sessionId, summary]));
    const openFacts = open.map((agent) => openFact(agent, summaries.get(agent.session?.id ?? "")));
    openFacts.forEach((fact) => facts.set(fact.id, fact));
    return openFacts;
  }

  private async searchLoop(result: AgentRunResult, context: TurnContext, round = 0): Promise<AgentRunResult> {
    const keywords = isRecord(result.output) ? stringsOf(result.output.search) : [];
    if (keywords.length === 0 || round >= MAX_SEARCH_ROUNDS) return result;
    const hits = await this.search(keywords, context);
    const last = round === MAX_SEARCH_ROUNDS - 1 ? ' This was your last search for this message; leave "search" empty and return your ops.' : "";
    const next = await this.runAgent(
      `<search-results keywords="${keywords.join(", ").replace(/"/g, "'")}">${JSON.stringify(hits)}</search-results>${last}`,
      result.conversationId,
    );
    return this.searchLoop(next, context, round + 1);
  }

  private async search(keywords: string[], { board, agents, worktrees, facts }: TurnContext): Promise<AgentSessionFact[]> {
    const holder = holderOf(board);
    const agentOf = new Map(agents.flatMap((agent) => (agent.session ? [[agent.session.id, agent] as const] : [])));
    const hits = searchSessions(await this.deps.listSessions(), keywords).map((summary) =>
      pastFact(summary, agentOf.get(summary.sessionId), worktreeAt(worktrees, summary.cwd), holder.get(summary.sessionId) ?? null),
    );
    hits.forEach((fact) => facts.set(fact.id, fact));
    return hits;
  }

  private remember(conversationId: string, facts: Map<string, AgentSessionFact>): void {
    this.factsByConversation.delete(conversationId);
    this.factsByConversation.set(conversationId, facts);
    const oldest = this.factsByConversation.keys().next().value;
    if (this.factsByConversation.size > MAX_CONVERSATIONS && oldest !== undefined) this.factsByConversation.delete(oldest);
  }
}
