import "server-only";
import { createOrcaServices, type OrcaServices } from "./orca/services";
import { ErrorLog } from "./shared/errorLog";
import { createWorkflowServices, type WorkflowServices } from "./workflow/services";

export interface Services {
  errorLog: ErrorLog;
  workflow: WorkflowServices;
  orca: OrcaServices;
}

function createServices(): Services {
  const errorLog = new ErrorLog();
  const reporters = {
    warn: (scope: string, error: unknown, context?: Record<string, unknown>) => errorLog.record("warn", scope, error, context),
    error: (scope: string, error: unknown, context?: Record<string, unknown>) => errorLog.record("error", scope, error, context),
  };
  const workflow = createWorkflowServices(reporters);
  return {
    errorLog,
    workflow,
    orca: createOrcaServices(reporters, workflow),
  };
}

const holder = globalThis as typeof globalThis & { __agentControlServices?: Services };

export function services(): Services {
  holder.__agentControlServices ??= createServices();
  return holder.__agentControlServices;
}

export function reportError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  services().errorLog.record("error", scope, error, context);
}

export function reportWarning(scope: string, error: unknown, context?: Record<string, unknown>): void {
  services().errorLog.record("warn", scope, error, context);
}
