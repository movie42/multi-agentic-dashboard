import { z } from "zod";

export const pullRequestListSchema = z.array(
  z.looseObject({
    number: z.number(),
    state: z.enum(["OPEN", "MERGED", "CLOSED"]),
    isDraft: z.boolean(),
    url: z.string(),
  }),
);

export const checklistItemSchema = z.looseObject({
  id: z.string().nullish(),
  done: z.boolean().nullish(),
});

export const flowStageSchema = z.looseObject({
  status: z.string().nullish(),
  blocks: z.array(z.looseObject({ type: z.string().nullish(), items: z.array(z.unknown()).nullish() })).nullish(),
  rounds: z
    .array(z.looseObject({ questions: z.array(z.looseObject({ decision: z.string().nullish() })).nullish() }))
    .nullish(),
});

export const flowTaskSchema = z.looseObject({
  id: z.string().nullish(),
  title: z.string().nullish(),
  branch: z.string().nullish(),
  links: z.array(z.looseObject({ label: z.string().nullish() })).nullish(),
  feature: z.looseObject({ id: z.string().nullish(), doc: z.string().nullish() }).nullish(),
  stages: z.record(z.string(), flowStageSchema.nullish()).nullish(),
});

export const featureRowSchema = z.looseObject({
  id: z.string().nullish(),
  title: z.string().nullish(),
  issue: z.string().nullish(),
  story: z.string().nullish(),
  branch: z.string().nullish(),
  worktree: z.string().nullish(),
  jira: z.looseObject({ status: z.string().nullish(), todo: z.string().nullish() }).nullish(),
});

export const featureSharedSchema = z.looseObject({
  item: z.string().nullish(),
  usedBy: z.union([z.array(z.string()), z.string()]).nullish(),
  buildIn: z.string().nullish(),
});

export const featureDocSchema = z.looseObject({
  id: z.string().nullish(),
  title: z.string().nullish(),
  root: z.string().nullish(),
  repo: z.string().nullish(),
  rows: z.array(featureRowSchema).nullish(),
  shared: z.array(featureSharedSchema).nullish(),
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type FlowStageJson = z.infer<typeof flowStageSchema>;
export type FlowTaskJson = z.infer<typeof flowTaskSchema>;
export type FeatureRowJson = z.infer<typeof featureRowSchema>;
export type FeatureSharedJson = z.infer<typeof featureSharedSchema>;
export type FeatureDocJson = z.infer<typeof featureDocSchema>;
