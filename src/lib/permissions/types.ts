export type PermissionDestination = "session" | "localSettings" | "projectSettings" | "userSettings" | "cliArg";

export interface PermissionRule {
  toolName: string;
  ruleContent?: string;
}

export type PermissionSuggestion =
  | { type: "addRules"; rules: PermissionRule[]; behavior: string; destination: PermissionDestination }
  | { type: "addDirectories"; directories: string[]; destination: PermissionDestination }
  | { type: "setMode"; mode: string; destination: PermissionDestination };

export interface PermissionHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_input: Record<string, unknown>;
  permission_suggestions?: unknown[];
}

export interface PendingPermission {
  id: string;
  paneKey: string;
  receivedAt: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions: PermissionSuggestion[];
  transcriptPath: string;
}

export type PermissionAnswer =
  | { behavior: "allow"; suggestionIndex: number | null }
  | { behavior: "deny"; message: string };

export type PermissionHookDecision =
  | { behavior: "allow"; updatedPermissions?: PermissionSuggestion[] }
  | { behavior: "deny"; message: string };

export interface PermissionHookOutput {
  hookSpecificOutput?: {
    hookEventName: "PermissionRequest";
    decision: PermissionHookDecision;
  };
}
