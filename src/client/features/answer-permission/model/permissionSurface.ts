import type { A2uiMessage } from "@/common/a2ui/messages";
import type { RunnerPermission, RunnerPermissionSuggestion } from "@/common/runner/types";
import { button, escapeMarkdown, surface, text, type Component } from "./surfaceParts";

export const PERMISSION_SURFACE = "permission";

const DESTINATION_LABEL: Record<string, string> = {
  session: "이번 세션",
  localSettings: "이 프로젝트 (나만)",
  projectSettings: "이 프로젝트",
  userSettings: "모든 프로젝트",
  cliArg: "실행 인자",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item: unknown) => (typeof item === "string" ? [item] : [])) : [];
}

function ruleText(rule: unknown): string | null {
  if (typeof rule !== "object" || rule === null) return null;
  const toolName = str(Reflect.get(rule, "toolName"));
  const content = str(Reflect.get(rule, "ruleContent"));
  if (!toolName) return null;
  return content ? `${toolName}(${content})` : toolName;
}

export function suggestionLabel(suggestion: RunnerPermissionSuggestion): string {
  if (suggestion.type === "addRules" && Array.isArray(suggestion.rules)) {
    const rules = suggestion.rules.flatMap((rule: unknown) => {
      const label = ruleText(rule);
      return label ? [label] : [];
    });
    return `다시 묻지 않기 · ${rules.join(", ")}`;
  }
  if (suggestion.type === "addDirectories") return `폴더 허용 · ${strings(suggestion.directories).join(", ")}`;
  if (suggestion.type === "setMode") return `모드 전환 · ${str(suggestion.mode) ?? ""}`;
  return String(suggestion.type);
}

function inputView(toolInput: Record<string, unknown>): Component[] {
  // ExitPlanMode carries the whole plan as markdown; JSON would show it as one escaped line.
  const plan = str(toolInput.plan);
  if (plan) return [{ id: "input", component: "Card", child: "plan" }, text("plan", plan)];
  const body = str(toolInput.command) ?? str(toolInput.file_path) ?? JSON.stringify(toolInput, null, 2);
  const description = str(toolInput.description);
  return [
    { id: "input", component: "Column", children: description ? ["inputBody", "inputNote"] : ["inputBody"] },
    { id: "inputBody", component: "Code", text: body },
    ...(description ? [text("inputNote", description, "caption")] : []),
  ];
}

function suggestionButtons(suggestions: RunnerPermissionSuggestion[]): Component[] {
  if (suggestions.length === 0) return [];
  const items = suggestions.flatMap((suggestion, index): Component[] => {
    const destination = typeof suggestion.destination === "string" ? (DESTINATION_LABEL[suggestion.destination] ?? suggestion.destination) : null;
    const id = `suggestion${index}`;
    return [
      { id, component: "Button", variant: "borderless", child: `${id}Body`, action: { event: { name: "allowSuggestion", context: { index } } } },
      { id: `${id}Body`, component: "Row", children: destination ? [`${id}Label`, `${id}Where`] : [`${id}Label`] },
      text(`${id}Label`, escapeMarkdown(suggestionLabel(suggestion))),
      ...(destination ? [text(`${id}Where`, destination, "caption")] : []),
    ];
  });
  return [{ id: "suggestions", component: "Row", children: suggestions.map((_, index) => `suggestion${index}`) }, ...items];
}

interface PermissionSurfaceOptions {
  denying: boolean;
  /** The session was handed out by a conductor, so this kind of request can be delegated to it. */
  delegable: boolean;
}

/** A tool permission request as an A2UI surface; its actions are allow, allowSuggestion, openDeny, cancelDeny, deny and delegate. */
export function permissionSurface(permission: RunnerPermission, { denying, delegable }: PermissionSurfaceOptions): A2uiMessage[] {
  const title = text("title", `**${escapeMarkdown(`${permission.toolName} 실행 허락이 필요해요`)}**`);
  const controls: Component[] = denying
    ? [
        { id: "controls", component: "Column", children: ["reason", "denyButtons"] },
        { id: "reason", component: "TextField", variant: "longText", value: { "@path": "/reason" }, placeholder: "거부 사유 (Claude에게 전달돼요)" },
        { id: "denyButtons", component: "Row", justify: "end", children: ["cancelDeny", "deny"] },
        ...button("cancelDeny", "취소", "cancelDeny"),
        ...button("deny", "거부", "deny", { variant: "primary", context: { reason: { "@path": "/reason" } } }),
      ]
    : [
        { id: "controls", component: "Row", children: ["allow", "openDeny"] },
        ...button("allow", "허용", "allow", { variant: "primary" }),
        ...button("openDeny", "거부", "openDeny"),
      ];
  const extras: Component[] = denying ? [] : suggestionButtons(permission.suggestions);
  const delegation: Component[] = denying
    ? []
    : permission.delegatedTo
      ? [text("delegation", "지휘자가 먼저 판단하는 중이에요. 여기서 답해도 돼요.", "caption")]
      : delegable
        ? button("delegation", "앞으로 지휘자에게 맡기기", "delegate", { variant: "borderless" })
        : [];
  const children = ["title", "input", "controls", ...(extras.length > 0 ? ["suggestions"] : []), ...(delegation.length > 0 ? ["delegation"] : [])];
  return surface(
    PERMISSION_SURFACE,
    [{ id: "root", component: "Column", children }, title, ...inputView(permission.toolInput), ...controls, ...extras, ...delegation],
    denying ? { reason: "" } : null,
  );
}
