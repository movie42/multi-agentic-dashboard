export type RuntimeMode = "app" | "headless" | "off";

export type RuntimeResponse = { ok: true; mode: RuntimeMode } | { ok: false; error: string };
