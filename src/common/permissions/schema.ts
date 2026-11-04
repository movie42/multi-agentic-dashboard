import { z } from "zod";

export const MAX_ANSWER = 8000;

const destinationSchema = z.enum(["session", "localSettings", "projectSettings", "userSettings", "cliArg"]);

const ruleSchema = z.object({ toolName: z.string(), ruleContent: z.string().optional() });

export const permissionSuggestionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addRules"), rules: z.array(ruleSchema), behavior: z.string(), destination: destinationSchema }),
  z.object({ type: z.literal("addDirectories"), directories: z.array(z.string()), destination: destinationSchema }),
  z.object({ type: z.literal("setMode"), mode: z.string(), destination: destinationSchema }),
]);

export const permissionHookInputSchema = z.looseObject({
  session_id: z.string(),
  transcript_path: z.string().catch(""),
  cwd: z.string().catch(""),
  hook_event_name: z.literal("PermissionRequest"),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  permission_suggestions: z.array(z.unknown()).optional(),
});

export const permissionAnswerSchema = z.discriminatedUnion("behavior", [
  z.object({ behavior: z.literal("allow"), suggestionIndex: z.number().int().nullable() }),
  z.object({ behavior: z.literal("answer"), answers: z.record(z.string(), z.string().max(MAX_ANSWER)) }),
  z.object({ behavior: z.literal("deny"), message: z.string().max(MAX_ANSWER) }),
]);

export type PermissionDestination = z.infer<typeof destinationSchema>;
export type PermissionRule = z.infer<typeof ruleSchema>;
export type PermissionSuggestion = z.infer<typeof permissionSuggestionSchema>;
export type PermissionHookInput = z.infer<typeof permissionHookInputSchema>;
export type PermissionAnswer = z.infer<typeof permissionAnswerSchema>;

export function suggestionsOf(raw: unknown[] | undefined): PermissionSuggestion[] {
  return (raw ?? []).flatMap((item) => {
    const parsed = permissionSuggestionSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
