import "server-only";
import { createWorktree } from "./create";
import { answerWizard, startWizard } from "./run";

export interface WorktreeWizardServices {
  start: typeof startWizard;
  answer: typeof answerWizard;
  create: typeof createWorktree;
}

export function createWorktreeWizardServices(): WorktreeWizardServices {
  return { start: startWizard, answer: answerWizard, create: createWorktree };
}
