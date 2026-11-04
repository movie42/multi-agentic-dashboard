import type { PermissionSuggestion } from "@/common/permissions/schema";

export type {
  PermissionAnswer,
  PermissionDestination,
  PermissionHookInput,
  PermissionRule,
  PermissionSuggestion,
} from "@/common/permissions/schema";

export interface PendingPermission {
  id: string;
  paneKey: string;
  receivedAt: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions: PermissionSuggestion[];
  transcriptPath: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface UserQuestion {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

export type PermissionHookDecision =
  | { behavior: "allow"; updatedPermissions?: PermissionSuggestion[]; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export interface PermissionHookOutput {
  hookSpecificOutput?: {
    hookEventName: "PermissionRequest";
    decision: PermissionHookDecision;
  };
}
