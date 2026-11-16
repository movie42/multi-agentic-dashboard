import { MAX_CLOSE_TERMINALS, type ActionRequest } from "@/common/actions/schema";
import type { AgentCard } from "@/common/board/types";
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
  onOpenWorktree: (worktreeId: string) => void;
  onConnectFrom: (id: string) => void;
  /** Open one line in the side panel with its text editor showing. */
  onEditLink: (edgeId: string) => void;
  onTidy: () => void;
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
 * Actions that work on any set of sessions: the right-clicked one, the selection, a group's members,
 * a worktree's sessions. Everything a single session can do that also makes sense for many is here.
 */
function sessionsItems(agents: AgentCard[], context: MenuContext, label: string): MenuItem[] {
  const { graph, canvas, save, onAction } = context;
  const ids = agents.map((agent) => agent.id);
  const idSet = new Set(ids);
  const links = graph.edges.filter((edge) => edge.linkId && (idSet.has(edge.from) || idSet.has(edge.to)));
  const grouped = ids.filter((id) => groupOf(canvas, id));
  const closable = agents.filter((agent) => agent.terminalHandle);
  const many = agents.length > 1;
  return compact([
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
    return {
      title: nodeTitle(agent),
      rename: sessionId ? { label: "이름 바꾸기", value: nodeTitle(agent), onSave: (title) => void onAction({ type: "rename-session", sessionId, title }) } : null,
      items: [
        { label: "패널에서 열기", run: () => context.select([agent.id]) },
        { label: "다른 세션과 잇기", run: () => context.onConnectFrom(agent.id) },
        { label: "워크트리 열기", run: () => context.onOpenWorktree(agent.worktreeId) },
        { label: "터미널 열기", run: () => void onAction({ type: "open-terminal", worktreePath: agent.worktreePath }) },
        ...sessionsItems([agent], context, "세션"),
      ],
    };
  }

  if (target.kind === "cluster") {
    const cluster = graph.clusters.find((entry) => entry.id === target.id);
    if (!cluster) return null;
    const { worktree } = cluster;
    const sessions = agentsOf(graph, cluster.nodeIds);
    return {
      title: `워크트리 · ${worktree.name}`,
      rename: worktree.isMain ? null : { label: "이름 바꾸기", value: worktree.name, onSave: (name) => void onAction({ type: "rename-worktree", worktreePath: worktree.path, name }) },
      items: [
        { label: "워크트리 열기", run: () => context.onOpenWorktree(worktree.worktreeId) },
        { label: "여기서 새 세션", run: () => void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" }) },
        { label: "터미널 열기", run: () => void onAction({ type: "open-terminal", worktreePath: worktree.path }) },
        ...(sessions.length > 0 ? sessionsItems(sessions, context, `이 워크트리 세션 ${sessions.length}개`) : []),
      ],
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
