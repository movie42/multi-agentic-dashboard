import { MAX_CLOSE_TERMINALS, type ActionRequest } from "@/common/actions/schema";
import { gitGraphHref } from "@/client/entities/git-graph";
import { intentDiffHref } from "@/client/entities/intent-diff";
import { requestWorktreeAction, type PanelWorktreeAction } from "@/client/entities/workspace";
import { restChoices, type RestOverrides } from "@/client/entities/agent";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import { type CanvasState, groupNodes, groupOf, renameGroup, ungroup } from "../model/canvasState";
import type { ProjectGraph } from "../model/graph";
import type { MenuItem, MenuRename } from "./CanvasMenu";
import type { MenuTarget } from "./CanvasStage";
import { nodeTitle } from "./NodeBox";

export interface MenuContext {
  graph: ProjectGraph;
  canvas: CanvasState;
  selected: string[];
  save: (change: (current: CanvasState) => CanvasState) => void;
  select: (ids: string[]) => void;
  onAction: (action: ActionRequest) => Promise<void>;
  /** Open a document in the right panel, or outside the app when the panel cannot show it. */
  onOpenDoc: (target: string) => void;
  onOpenWorktree: (worktreeId: string) => void;
  onConnectFrom: (id: string) => void;
  /** Open one line in the side panel with its text editor showing. */
  onEditLink: (edgeId: string) => void;
  onTidy: () => void;
  /** Open the conductor form on the canvas for this worktree. */
  onLaunchConductor: (worktreeId: string) => void;
  onExpandTemplate: () => void;
  onSaveAsTemplate: (agents: AgentCard[]) => void;
  /** A person's 쉬는 중 / 잠자는 중 marks. */
  rest: RestOverrides;
}

export interface MenuContent {
  title: string;
  rename: MenuRename | null;
  items: MenuItem[];
}

const compact = (items: Array<MenuItem | null | false>): MenuItem[] => items.filter((item): item is MenuItem => Boolean(item));

function closeSessions(agents: AgentCard[], onAction: MenuContext["onAction"]): void {
  const handles = agents.flatMap((agent) => (agent.terminalHandle ? [agent.terminalHandle] : []));
  const batches = Math.ceil(handles.length / MAX_CLOSE_TERMINALS);
  Array.from({ length: batches }, (_, index) => handles.slice(index * MAX_CLOSE_TERMINALS, (index + 1) * MAX_CLOSE_TERMINALS)).forEach(
    (terminalHandles) => void onAction({ type: "close-terminals", terminalHandles }),
  );
}

/**
 * The pages of the flow tasks tied to the worktrees, then the documents the sessions wrote (the chips
 * under a session card), one entry per file.
 */
function docsItem(agents: AgentCard[], worktrees: WorktreeSummary[], onOpenDoc: MenuContext["onOpenDoc"]): MenuItem | null {
  const seen = new Set<string>();
  const entry = (target: string, label: string, hint: string | undefined): MenuItem[] => {
    if (seen.has(target)) return [];
    seen.add(target);
    return [{ key: target, label, hint, run: () => onOpenDoc(target) }];
  };
  const flowPages = worktrees.flatMap((worktree) =>
    worktree.flowTasks.flatMap((task) =>
      task.pageIndex ? entry(task.pageIndex, task.title, `flow · ${task.taskId}${worktrees.length > 1 ? ` · ${worktree.name}` : ""}`) : [],
    ),
  );
  const sessionDocs = agents.flatMap((agent) =>
    agent.artifacts.flatMap((artifact) =>
      artifact.kind === "pr" ? [] : entry(artifact.target, artifact.label, agents.length > 1 ? nodeTitle(agent) : undefined),
    ),
  );
  const children = [...flowPages, ...sessionDocs];
  return children.length > 0 ? { label: `문서 열기 (${children.length})`, run: () => {}, children } : null;
}

function worktreesOf(graph: ProjectGraph, agents: AgentCard[]): WorktreeSummary[] {
  const ids = new Set(agents.map((agent) => agent.worktreeId));
  return graph.clusters.flatMap((cluster) => (ids.has(cluster.worktree.worktreeId) ? [cluster.worktree] : []));
}

/**
 * Actions that work on any set of sessions: the right-clicked one, the selection, a group's members,
 * a worktree's sessions. Everything a single session can do that also makes sense for many is here.
 */
function sessionsItems(agents: AgentCard[], context: MenuContext, label: string, withDocs = true): MenuItem[] {
  const { graph, canvas, save, onAction } = context;
  const ids = agents.map((agent) => agent.id);
  const idSet = new Set(ids);
  const links = graph.edges.filter((edge) => edge.linkId && (idSet.has(edge.from) || idSet.has(edge.to)));
  const grouped = ids.filter((id) => groupOf(canvas, id));
  const closable = agents.filter((agent) => agent.terminalHandle);
  const many = agents.length > 1;
  const settable = agents.filter((agent) => agent.state !== "working").length;
  const restItems = restChoices(agents, context.rest.restOf).map(
    (choice): MenuItem => ({
      key: `rest:${choice.kind ?? "clear"}`,
      label: many ? `${choice.label} (${settable}개)` : choice.label,
      run: () => context.rest.setRest(agents, choice.kind),
    }),
  );
  return compact([
    withDocs && docsItem(agents, worktreesOf(graph, agents), context.onOpenDoc),
    ...restItems,
    many && { label: `${label} 고르기`, run: () => context.select(ids) },
    {
      label: many ? `${label} 그룹으로 묶기` : "그룹으로 묶기",
      run: () => {
        const id = crypto.randomUUID();
        save((current) => groupNodes(current, ids, id, `그룹 ${current.groups.length + 1}`));
      },
    },
    grouped.length > 0 && {
      label: many ? `그룹에서 빼기 (${grouped.length}개)` : `'${groupOf(canvas, ids[0]!)?.name ?? ""}'에서 빼기`,
      run: () =>
        save((current) => ({
          ...current,
          groups: current.groups
            .map((group) => ({ ...group, memberIds: group.memberIds.filter((member) => !idSet.has(member)) }))
            .filter((group) => group.memberIds.length > 0),
        })),
    },
    links.length > 0 && {
      label: `연결 ${links.length}개 끊기`,
      danger: true,
      confirm: `한 번 더 누르면 연결 ${links.length}개를 끊어요`,
      run: () => links.forEach((edge) => edge.linkId && void onAction({ type: "unlink-sessions", linkId: edge.linkId })),
    },
    { label: many ? `${label} 템플릿으로 저장` : "템플릿으로 저장", run: () => context.onSaveAsTemplate(agents) },
    {
      label: many ? `${label} 닫기 (${closable.length}개)` : "세션 닫기",
      danger: true,
      disabled: closable.length === 0,
      confirm: many ? `한 번 더 누르면 ${closable.length}개를 닫아요` : "한 번 더 누르면 닫아요",
      run: () => closeSessions(closable, onAction),
    },
  ]);
}

function agentsOf(graph: ProjectGraph, ids: string[]): AgentCard[] {
  return ids.flatMap((id) => graph.nodes.get(id)?.agent ?? []);
}

/** What a right-click offers. A click on a selected box acts on the whole selection, like Figma. */
export function menuFor(target: MenuTarget, context: MenuContext): MenuContent | null {
  const { graph, canvas, save, onAction } = context;

  if (target.kind === "node") {
    const agent = graph.nodes.get(target.id)?.agent;
    if (!agent) return null;
    const selection = context.selected.includes(agent.id) && context.selected.length > 1 ? agentsOf(graph, context.selected) : null;
    if (selection) {
      return { title: `고른 세션 ${selection.length}개`, rename: null, items: sessionsItems(selection, context, `세션 ${selection.length}개`) };
    }
    const sessionId = agent.session?.id ?? null;
    const terminalHandle = agent.agentType === "shell" ? agent.terminalHandle : null;
    const rename: MenuRename | null = sessionId
      ? { label: "이름 바꾸기", value: nodeTitle(agent), onSave: (title) => void onAction({ type: "rename-session", sessionId, title }) }
      : terminalHandle
        ? { label: "별칭 지정", value: agent.title ?? "", onSave: (title) => void onAction({ type: "rename-terminal", terminalHandle, title }) }
        : null;
    return {
      title: nodeTitle(agent),
      rename,
      items: [
        { label: "패널에서 열기", run: () => context.select([agent.id]) },
        { label: "다른 세션과 잇기", run: () => context.onConnectFrom(agent.id) },
        { label: "워크트리 열기", run: () => context.onOpenWorktree(agent.worktreeId) },
        { label: "셸 터미널", run: () => void onAction({ type: "open-terminal", worktreePath: agent.worktreePath }) },
        ...sessionsItems([agent], context, "세션"),
      ],
    };
  }

  if (target.kind === "cluster") {
    const cluster = graph.clusters.find((entry) => entry.id === target.id);
    if (!cluster) return null;
    const { worktree } = cluster;
    const sessions = agentsOf(graph, cluster.nodeIds);
    // These forms live in the worktree panel: switch to it and let it open the form.
    const inPanel = (action: PanelWorktreeAction) => {
      context.onOpenWorktree(worktree.worktreeId);
      requestWorktreeAction(worktree.worktreeId, action);
    };
    return {
      title: `워크트리 · ${worktree.name}`,
      rename: worktree.isMain ? null : { label: "이름 바꾸기", value: worktree.name, onSave: (name) => void onAction({ type: "rename-worktree", worktreePath: worktree.path, name }) },
      items: compact([
        docsItem(sessions, [worktree], context.onOpenDoc),
        { label: "새 세션", run: () => void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" }) },
        { label: "지휘자", run: () => context.onLaunchConductor(worktree.worktreeId) },
        { label: "템플릿 펼치기", run: context.onExpandTemplate },
        { label: "셸 터미널", run: () => void onAction({ type: "open-terminal", worktreePath: worktree.path }) },
        { label: "변경 읽기", run: () => window.open(intentDiffHref({ worktreePath: worktree.path }), "_blank", "noopener") },
        { label: "깃 그래프", run: () => window.open(gitGraphHref(worktree.path), "_blank", "noopener") },
        { label: "여기서 워크트리 만들기", run: () => inPanel("worktree") },
        !worktree.isMain && { label: "워크트리 삭제", danger: true, run: () => inPanel("remove") },
        { label: "워크트리 열기", run: () => context.onOpenWorktree(worktree.worktreeId) },
        ...(sessions.length > 0 ? sessionsItems(sessions, context, `이 워크트리 세션 ${sessions.length}개`, false) : []),
      ]),
    };
  }

  if (target.kind === "group") {
    const group = canvas.groups.find((entry) => entry.id === target.id);
    if (!group) return null;
    const members = agentsOf(graph, group.memberIds);
    const closable = members.filter((member) => member.terminalHandle);
    return {
      title: `그룹 · ${group.name}`,
      rename: { label: "이름 바꾸기", value: group.name, onSave: (name) => save((current) => renameGroup(current, group.id, name)) },
      items: compact([
        { label: `안의 세션 ${members.length}개 고르기`, run: () => context.select(members.map((member) => member.id)) },
        { label: "그룹 풀기", run: () => save((current) => ungroup(current, group.id)) },
        {
          label: `안의 세션 닫기 (${closable.length}개)`,
          danger: true,
          disabled: closable.length === 0,
          confirm: `한 번 더 누르면 ${closable.length}개를 닫아요`,
          run: () => closeSessions(closable, onAction),
        },
      ]),
    };
  }

  if (target.kind === "canvas") {
    const selection = agentsOf(graph, context.selected);
    return {
      title: selection.length > 0 ? `고른 세션 ${selection.length}개` : "캔버스",
      rename: null,
      items: [
        ...(selection.length > 0 ? sessionsItems(selection, context, `세션 ${selection.length}개`) : []),
        { label: "모든 세션 고르기", run: () => context.select([...graph.nodes.keys()]) },
        ...(selection.length > 0 ? [{ label: "고르기 해제", run: () => context.select([]) }] : []),
        { label: "자동 정리", run: context.onTidy },
      ],
    };
  }

  const edge = graph.edges.find((entry) => entry.id === target.id);
  const linkId = edge?.linkId;
  if (!edge || !linkId) return null;
  return {
    title: "연결",
    rename: null,
    items: [
      ...(edge.kind === "delegate" || edge.kind === "next" ? [{ label: "내용 고치기", run: () => context.onEditLink(edge.id) }] : []),
      ...(edge.paused ? [{ label: "다시 켜기", run: () => void onAction({ type: "resume-link", linkId }) }] : []),
      { label: "끊기", danger: true, run: () => void onAction({ type: "unlink-sessions", linkId }) },
    ],
  };
}
