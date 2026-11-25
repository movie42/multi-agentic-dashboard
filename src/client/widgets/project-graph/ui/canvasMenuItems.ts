import { MAX_CLOSE_TERMINALS, type ActionRequest } from "@/common/actions/schema";
import { gitGraphHref } from "@/client/entities/git-graph";
import { intentDiffHref } from "@/client/entities/intent-diff";
import { openWorkspaceWindow, requestWorktreeAction, type PanelWorktreeAction } from "@/client/entities/workspace";
import { requestRemoveWorktree } from "@/client/features/remove-worktree";
import { openSessionWindow, restChoices, type RestOverrides } from "@/client/entities/agent";
import { controlRun, removeRun } from "@/client/entities/runner";
import type { TemplateRun } from "@/common/templates/types";
import type { AgentCard, WorktreeSummary } from "@/common/board/types";
import type { ItemColorTarget } from "@/client/features/customize-canvas-color";
import { areaOf, type SessionArea } from "@/client/entities/session-area";
import type { ProjectGraph } from "../model/graph";
import type { MenuGroup, MenuItem, MenuRename } from "./CanvasMenu";
import type { MenuTarget } from "./CanvasStage";
import { nodeTitle } from "./NodeBox";

export interface MenuContext {
  graph: ProjectGraph;
  selected: string[];
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
  /** Open the editor on a template run expanded on this canvas. */
  onEditRun: (run: TemplateRun) => void;
  /** A person's 쉬는 중 / 잠자는 중 marks. */
  rest: RestOverrides;
  /** Open the colour editor for these frames or cards; `title` names them in it. */
  onEditColors: (targets: ItemColorTarget[], title: string) => void;
  areas: CanvasAreaActions;
}

/** The named areas inside each worktree, shared with the session tabs. */
export interface CanvasAreaActions {
  of: (worktreeId: string) => SessionArea[];
  /** A new area holding these sessions, all from one worktree; its name is typed right after. */
  create: (sessionIds: string[]) => void;
  /** `areaId` null takes them out of every area. */
  moveTo: (sessionIds: string[], areaId: string | null) => void;
  rename: (areaId: string, name: string) => void;
  toggle: (areaId: string) => void;
  remove: (areaId: string) => void;
}

/**
 * Every canvas menu has the same first level, in the same order: open, create, session state, arrange,
 * then the destructive ones last. Each opens its items to the side.
 */
export interface MenuContent {
  /** Names the menu for screen readers; not drawn. */
  title: string;
  /** Drawn on top only when the menu acts on more than the right-clicked thing ("고른 세션 2개"). */
  heading?: string;
  rename: MenuRename | null;
  groups: MenuGroup[];
  /** The frames or cards the swatch row on top paints; `custom` opens the full colour editor. */
  colors?: MenuColors;
}

export interface MenuColors {
  targets: ItemColorTarget[];
  custom: () => void;
}

type Entry = MenuItem | null | false;

const compact = (items: Entry[]): MenuItem[] => items.filter((item): item is MenuItem => Boolean(item));

interface Sections {
  open?: Entry[];
  create?: Entry[];
  state?: Entry[];
  arrange?: Entry[];
  danger?: Entry[];
}

function sectioned({ open = [], create = [], state = [], arrange = [], danger = [] }: Sections): MenuGroup[] {
  return [
    { label: "열기", items: compact(open) },
    { label: "만들기", items: compact(create) },
    { label: "상태 바꾸기", items: compact(state) },
    { label: "정리", items: compact(arrange) },
    { label: "닫기·지우기", items: compact(danger) },
  ].filter((group) => group.items.length > 0);
}

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
 * a worktree's sessions. `label` names the set ("세션 3개") when there is more than one.
 */
function sessionsSections(agents: AgentCard[], context: MenuContext, label: string): Required<Pick<Sections, "state" | "arrange" | "danger">> {
  const { graph, onAction } = context;
  const ids = agents.map((agent) => agent.id);
  const idSet = new Set(ids);
  const links = graph.edges.filter((edge) => edge.linkId && (idSet.has(edge.from) || idSet.has(edge.to)));
  const closable = agents.filter((agent) => agent.terminalHandle);
  const many = agents.length > 1;
  const settable = agents.filter((agent) => agent.state !== "working").length;
  const worktreeIds = [...new Set(agents.map((agent) => agent.worktreeId))];
  const oneWorktree = worktreeIds.length === 1 ? worktreeIds[0]! : null;
  const areas = oneWorktree ? context.areas.of(oneWorktree) : [];
  const areaIdOf = (id: string) => areaOf(areas, id)?.id ?? null;
  const targets = areas.filter((area) => ids.some((id) => areaIdOf(id) !== area.id));
  const inArea = ids.filter((id) => areaIdOf(id) !== null);
  return {
    state: restChoices(agents, context.rest.restOf).map(
      (choice): MenuItem => ({
        key: `rest:${choice.kind ?? "clear"}`,
        label: many ? `${choice.label} (${settable}개)` : choice.label,
        run: () => context.rest.setRest(agents, choice.kind),
      }),
    ),
    arrange: [
      many && { label: `${label} 고르기`, run: () => context.select(ids) },
      oneWorktree !== null && { label: many ? `${label} 새 영역으로 묶기` : "새 영역으로 묶기", run: () => context.areas.create(ids) },
      targets.length > 0 && {
        label: "영역으로 옮기기",
        run: () => {},
        children: targets.map((area): MenuItem => ({ key: area.id, label: area.name, run: () => context.areas.moveTo(ids, area.id) })),
      },
      inArea.length > 0 && {
        label: many ? `영역에서 빼기 (${inArea.length}개)` : `'${areaOf(areas, ids[0]!)?.name ?? ""}'에서 빼기`,
        run: () => context.areas.moveTo(inArea, null),
      },
      { label: many ? `${label} 템플릿으로 저장` : "템플릿으로 저장", run: () => context.onSaveAsTemplate(agents) },
    ],
    danger: [
      links.length > 0 && {
        label: `연결 ${links.length}개 끊기`,
        danger: true,
        confirm: `한 번 더 누르면 연결 ${links.length}개를 끊어요`,
        run: () => links.forEach((edge) => edge.linkId && void onAction({ type: "unlink-sessions", linkId: edge.linkId })),
      },
      {
        label: many ? `${label} 닫기${closable.length < agents.length ? ` (${closable.length}개)` : ""}` : "세션 닫기",
        danger: true,
        disabled: closable.length === 0,
        confirm: many ? `한 번 더 누르면 ${closable.length}개를 닫아요` : "한 번 더 누르면 닫아요",
        run: () => closeSessions(closable, onAction),
      },
    ],
  };
}

function agentsOf(graph: ProjectGraph, ids: string[]): AgentCard[] {
  return ids.flatMap((id) => graph.nodes.get(id)?.agent ?? []);
}

function colorsOf(targets: ItemColorTarget[], title: string, context: MenuContext): MenuColors {
  return { targets, custom: () => context.onEditColors(targets, title) };
}

const cardTargets = (agents: AgentCard[]): ItemColorTarget[] => agents.map((agent) => ({ scope: "card", id: agent.id }));

function selectionMenu(selection: AgentCard[], context: MenuContext, extra: Sections = {}): MenuContent {
  const label = `세션 ${selection.length}개`;
  const sessions = sessionsSections(selection, context, label);
  const title = `고른 세션 ${selection.length}개`;
  return {
    title,
    heading: title,
    rename: null,
    groups: sectioned({
      open: [docsItem(selection, worktreesOf(context.graph, selection), context.onOpenDoc), ...(extra.open ?? [])],
      state: sessions.state,
      arrange: [...sessions.arrange, ...(extra.arrange ?? [])],
      danger: sessions.danger,
    }),
    colors: colorsOf(cardTargets(selection), title, context),
  };
}

/** A template card that has no session yet: it can only be looked at, edited with its run, or have its run stopped. */
function reservedMenu(id: string, context: MenuContext): MenuContent | null {
  const reserved = context.graph.reserved.get(id);
  if (!reserved) return null;
  const { run, card } = reserved;
  const active = run.state === "running" || run.state === "paused";
  return {
    title: `예약 카드 · ${card.title}`,
    rename: null,
    groups: sectioned({
      open: [{ label: "패널에서 열기", run: () => context.select([id]) }],
      arrange: [{ label: "흐름 고치기", run: () => context.onEditRun(run) }],
      danger: [
        active
          ? { label: "흐름 멈추기", danger: true, confirm: `한 번 더 누르면 '${run.name}' 흐름을 멈춰요`, run: () => void controlRun(run.id, { action: "stop" }) }
          : { label: "흐름 지우기", danger: true, confirm: `한 번 더 누르면 '${run.name}' 흐름을 지워요`, run: () => void removeRun(run.id) },
      ],
    }),
  };
}

function canvasItems(context: MenuContext, selection: AgentCard[]): MenuItem[] {
  return [
    { label: "모든 세션 고르기", run: () => context.select([...context.graph.nodes.keys()]) },
    ...(selection.length > 0 ? [{ label: "고르기 해제", run: () => context.select([]) }] : []),
    { label: "자동 정리", run: context.onTidy },
  ];
}

/** What a right-click offers. A click on a selected box acts on the whole selection, like Figma. */
export function menuFor(target: MenuTarget, context: MenuContext): MenuContent | null {
  const { graph, onAction } = context;

  if (target.kind === "node") {
    const agent = graph.nodes.get(target.id)?.agent;
    if (!agent) return reservedMenu(target.id, context);
    const selection = context.selected.includes(agent.id) && context.selected.length > 1 ? agentsOf(graph, context.selected) : null;
    if (selection) return selectionMenu(selection, context);
    const sessionId = agent.session?.id ?? null;
    const terminalHandle = agent.agentType === "shell" ? agent.terminalHandle : null;
    const rename: MenuRename | null = sessionId
      ? { label: "이름 바꾸기", value: nodeTitle(agent), onSave: (title) => void onAction({ type: "rename-session", sessionId, title }) }
      : terminalHandle
        ? { label: "별칭 지정", value: agent.title ?? "", onSave: (title) => void onAction({ type: "rename-terminal", terminalHandle, title }) }
        : null;
    const sessions = sessionsSections([agent], context, "세션");
    return {
      title: nodeTitle(agent),
      rename,
      groups: sectioned({
        open: [
          { label: "패널에서 열기", run: () => context.select([agent.id]) },
          { label: "새 창에서 열기", run: () => openSessionWindow(agent.id) },
          docsItem([agent], worktreesOf(graph, [agent]), context.onOpenDoc),
          { label: "워크트리 열기", run: () => context.onOpenWorktree(agent.worktreeId) },
          { label: "셸 터미널", run: () => void onAction({ type: "open-terminal", worktreePath: agent.worktreePath }) },
        ],
        create: [{ label: "다른 세션과 잇기", run: () => context.onConnectFrom(agent.id) }],
        ...sessions,
      }),
      colors: colorsOf(cardTargets([agent]), nodeTitle(agent), context),
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
    const bulk = sessions.length > 0 ? sessionsSections(sessions, context, `세션 ${sessions.length}개`) : null;
    return {
      title: `워크트리 · ${worktree.name}`,
      rename: worktree.isMain ? null : { label: "이름 바꾸기", value: worktree.name, onSave: (name) => void onAction({ type: "rename-worktree", worktreePath: worktree.path, name }) },
      groups: sectioned({
        open: [
          { label: "워크트리 열기", run: () => context.onOpenWorktree(worktree.worktreeId) },
          { label: "새 창에서 열기", run: () => openWorkspaceWindow(worktree.repo, worktree.worktreeId) },
          docsItem(sessions, [worktree], context.onOpenDoc),
          { label: "셸 터미널", run: () => void onAction({ type: "open-terminal", worktreePath: worktree.path }) },
          { label: "변경 읽기", run: () => window.open(intentDiffHref({ worktreePath: worktree.path }), "_blank", "noopener") },
          { label: "깃 그래프", run: () => window.open(gitGraphHref(worktree.path), "_blank", "noopener") },
        ],
        create: [
          { label: "새 세션", run: () => void onAction({ type: "launch-agent", worktreePath: worktree.path, prompt: "" }) },
          { label: "지휘자", run: () => context.onLaunchConductor(worktree.worktreeId) },
          { label: "템플릿 펼치기", run: context.onExpandTemplate },
          { label: "여기서 워크트리 만들기", run: () => inPanel("worktree") },
        ],
        state: bulk?.state,
        arrange: bulk?.arrange,
        danger: [...(bulk?.danger ?? []), !worktree.isMain && { label: "워크트리 삭제", danger: true, run: () => requestRemoveWorktree(worktree, sessions.length) }],
      }),
      colors: colorsOf([{ scope: "worktree", id: worktree.worktreeId }], `워크트리 · ${worktree.name}`, context),
    };
  }

  if (target.kind === "project") {
    const title = `프로젝트 · ${target.id}`;
    return { title, rename: null, groups: sectioned({ arrange: canvasItems(context, []) }), colors: colorsOf([{ scope: "project", id: target.id }], title, context) };
  }

  if (target.kind === "area") {
    const found = graph.clusters.flatMap((cluster) => {
      const area = context.areas.of(cluster.worktree.worktreeId).find((entry) => entry.id === target.id);
      return area ? [{ area, cluster }] : [];
    })[0];
    if (!found) return null;
    const { area, cluster } = found;
    const members = agentsOf(graph, area.memberIds.filter((id) => cluster.nodeIds.includes(id)));
    return {
      title: `영역 · ${area.name}`,
      rename: { label: "이름 바꾸기", value: area.name, onSave: (name) => context.areas.rename(area.id, name) },
      groups: sectioned({
        arrange: [
          members.length > 0 && { label: `안의 세션 ${members.length}개 고르기`, run: () => context.select(members.map((member) => member.id)) },
          { label: area.collapsed ? "펼치기" : "접기", run: () => context.areas.toggle(area.id) },
        ],
        danger: [
          {
            label: "영역 지우기",
            danger: true,
            confirm: "한 번 더 누르면 영역을 지워요. 안의 세션은 영역 밖으로 나와요",
            run: () => context.areas.remove(area.id),
          },
        ],
      }),
    };
  }

  if (target.kind === "canvas") {
    const selection = agentsOf(graph, context.selected);
    const items = canvasItems(context, selection);
    if (selection.length > 0) return selectionMenu(selection, context, { arrange: items });
    return { title: "캔버스", rename: null, groups: sectioned({ arrange: items }) };
  }

  const edge = graph.edges.find((entry) => entry.id === target.id);
  const linkId = edge?.linkId;
  if (!edge || !linkId) return null;
  return {
    title: "연결",
    rename: null,
    groups: sectioned({
      arrange: [
        (edge.kind === "delegate" || edge.kind === "next") && { label: "내용 고치기", run: () => context.onEditLink(edge.id) },
        edge.paused && { label: "다시 켜기", run: () => void onAction({ type: "resume-link", linkId }) },
      ],
      danger: [{ label: "끊기", danger: true, run: () => void onAction({ type: "unlink-sessions", linkId }) }],
    }),
  };
}
