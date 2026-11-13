import { describe, expect, it } from "vitest";
import { hookSettings, shellQuote } from "./hookSettings.ts";

describe("hookSettings", () => {
  it("points every status hook at this session's address on the daemon", () => {
    const settings = JSON.parse(hookSettings("http://127.0.0.1:3198", "abc"));
    expect(Object.keys(settings.hooks)).toEqual(["SessionStart", "UserPromptSubmit", "PostToolUse", "Notification", "Stop", "PermissionRequest"]);
    expect(settings.hooks.Stop[0].hooks[0]).toEqual({
      type: "http",
      url: "http://127.0.0.1:3198/hooks/abc/Stop",
      timeout: 5,
    });
    expect(settings.statusLine).toBeUndefined();
  });

  it("holds permission requests long enough for an answer from the dashboard", () => {
    const settings = JSON.parse(hookSettings("http://127.0.0.1:3198", "abc"));
    expect(settings.hooks.PermissionRequest[0].hooks[0]).toEqual({
      type: "http",
      url: "http://127.0.0.1:3198/hooks/abc/PermissionRequest",
      timeout: 600,
    });
  });

  it("runs the status line script with this session's report address", () => {
    const settings = JSON.parse(
      hookSettings("http://127.0.0.1:3198", "abc", { node: "/opt/node", script: "/repo's/daemon/statusline.mjs" }),
    );
    expect(settings.statusLine).toEqual({
      type: "command",
      command: `'/opt/node' '/repo'\\''s/daemon/statusline.mjs' 'http://127.0.0.1:3198/statusline/abc'`,
      padding: 0,
    });
  });

  it("quotes a value for the shell", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});
