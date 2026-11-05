import "server-only";
import { z } from "zod";
import type { WizardOrigin, WorktreePlan } from "@/common/worktreeWizard/types";
import { services } from "@/server/container";

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const REF = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const MAX_PROMPT = 8000;

/** Field-level problems with a plan the user may have edited; empty when it can be created. */
export function planProblems(plan: WorktreePlan): string[] {
  const problems: string[] = [];
  if (!NAME.test(plan.name)) problems.push("워크트리 이름은 영문·숫자·.-_ 만 쓸 수 있어요");
  if (!REF.test(plan.branch) || plan.branch.endsWith("/")) problems.push("브랜치 이름이 올바르지 않아요");
  if (!REF.test(plan.baseBranch)) problems.push("기준 브랜치 이름이 올바르지 않아요");
  if (plan.reference !== null && !JIRA_KEY.test(plan.reference)) problems.push("Jira 키는 COMP-123 모양이어야 해요");
  if (plan.firstPrompt.length > MAX_PROMPT) problems.push("첫 요청이 너무 길어요");
  return problems;
}

const CreateResultSchema = z.object({
  worktree: z.object({ path: z.string().optional(), displayName: z.string().optional() }).optional(),
});

export async function createWorktree(origin: WizardOrigin, plan: WorktreePlan): Promise<{ path: string; name: string }> {
  const problems = planProblems(plan);
  if (problems.length > 0) throw new Error(problems.join(" · "));
  const prompt = plan.firstPrompt.trim();
  const parent = plan.parent === "from" && origin.from ? ["--parent-worktree", `path:${origin.from.path}`] : ["--no-parent"];
  const result = await services().orca.cli.run(
    [
      "worktree",
      "create",
      "--repo",
      `id:${origin.repoId}`,
      "--name",
      plan.name,
      "--branch",
      plan.branch,
      "--base-branch",
      plan.baseBranch,
      ...parent,
      ...(plan.reference ? ["--reference", plan.reference] : []),
      ...(prompt ? ["--agent", "claude", "--surface", "terminal", "--prompt", prompt] : []),
    ],
    CreateResultSchema,
    120_000,
  );
  return { path: result.worktree?.path ?? "", name: result.worktree?.displayName ?? plan.name };
}
