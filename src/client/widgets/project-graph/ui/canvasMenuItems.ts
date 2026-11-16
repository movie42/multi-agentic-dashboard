import type { ActionRequest } from "@/common/actions/schema";
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
}

export interface MenuContent {
  title: string;
  rename: MenuRename | null;
  items: MenuItem[];
}

/** What a right-click offers on each kind of thing on the canvas. */
export function menuFor(target: MenuTarget, context: MenuContext): MenuContent | null {
  const { graph, canvas, save, onAction } = context;
  if (target.kind === "node") {
    const agent = graph.nodes.get(target.id)?.agent;
    if (!agent) return null;
    const group = groupOf(canvas, agent.id);
    const together = context.selected.includes(agent.id) && context.selected.length > 1 ? context.selected : [agent.id];
    const links = graph.edges.filter((edge) => edge.linkId && (edge.from === agent.id || edge.to === agent.id));
    const sessionId = agent.session?.id ?? null;
    const terminalHandle = agent.terminalHandle;
    return {
      title: nodeTitle(agent),
      rename: sessionId ? { label: "이름 바꾸기", value: nodeTitle(agent), onSave: (title) => void onAction({ type: "rename-session", sessionId, title }) } : null,
      items: [
        { label: "패널에서 열기", run: () => context.select([agent.id]) },
        { label: "워크트리 열기", run: () => context.onOpenWorktree(agent.worktreeId) },
        { label: "터미널 열기", run: () => void onAction({ type: "open-terminal", worktreePath: agent.worktreePath }) },
        {
          label: together.length > 1 ? `고른 ${together.length}개 그룹으로 묶기` : "그룹으로 묶기",
          run: () => {
            const id = crypto.randomUUID();
            save((current) => groupNodes(current, together, id, `그룹 ${current.groups.length + 1}`));
          },
        },
        ...(group
          ? [{ label: `'${group.name}'에서 빼기`, run: () => save((current) => ({ ...current, groups: current.groups.map((entry) => (entry.id === group.id ? { ...entry, memberIds: entry.memberIds.filter((id) => id !== agent.id) } : entry)).filter((entry) => entry.memberIds.length > 0) })) }]
          : []),
        ...(links.length > 0
          ? [{ label: `연결 ${links.length}개 모두 끊기`, danger: true, confirm: "한 번 더 누르면 끊어요", run: () => links.forEach((edge) => edge.linkId && void onAction({ type: "unlink-sessions", linkId: edge.linkId })) }]
          : []),
        {
          label: "세션 닫기",
          danger: true,
          disabled: !terminalHandle,
          confirm: "한 번 더 누르면 닫아요",
          run: () => terminalHandle && void onAction({ type: "close-terminal", terminalHandle }),
        },
      ],
    };
  }
  if (target.kind === "cluster") {
    const worktree = graph.clusters.find((cluster) => cluster.id === target.id)?.worktree;
    if (!worktree) return null;
    return {
      title: `워크트리 · ${worktree.name}`,
      rename: worktree.isMain ? null : { label: "이름 바꾸기", value: worktree.name, onSave: (name) => void onAction({ type: "rename-worktree", worktreePath: worktree.path, name }) },
      items: [
        { label: "워크트리 열기", run: () => context.onOpenWorktree(worktree.worktreeId) },
        { label: "여기서 새 세션", run: () => void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" }) },
        { label: "터미널 열기", run: () => void onAction({ type: "open-terminal", worktreePath: worktree.path }) },
      ],
    };
  }
  if (target.kind === "group") {
    const group = canvas.groups.find((entry) => entry.id === target.id);
    if (!group) return null;
    return {
      title: `그룹 · ${group.name}`,
      rename: { label: "이름 바꾸기", value: group.name, onSave: (name) => save((current) => renameGroup(current, group.id, name)) },
      items: [
        { label: "안의 상자 모두 고르기", run: () => context.select(group.memberIds) },
        { label: "그룹 풀기", run: () => save((current) => ungroup(current, group.id)) },
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
      ...(edge.paused ? [{ label: "다시 켜기", run: () => void onAction({ type: "resume-link", linkId }) }] : []),
      { label: "끊기", danger: true, run: () => void onAction({ type: "unlink-sessions", linkId }) },
    ],
  };
}
