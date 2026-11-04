import "server-only";
import { ErrorLog } from "./shared/errorLog";

export interface Services {
  errorLog: ErrorLog;
}

function createServices(): Services {
  return {
    errorLog: new ErrorLog(),
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
