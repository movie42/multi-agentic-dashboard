import { describe, expect, it } from "vitest";
import { commandFor } from "./command.ts";

const environment = { claude: "claude", shell: "/bin/zsh", baseUrl: "http://127.0.0.1:3198" };

describe("commandFor", () => {
  it("starts a new Claude session under the daemon's id, with the hooks that report its status", () => {
    const command = commandFor({ id: "s1", kind: "claude" }, environment);
    expect(command.file).toBe("claude");
    expect(command.args.slice(0, 2)).toEqual(["--session-id", "s1"]);
    expect(command.args).toEqual(expect.arrayContaining(["--permission-mode", "bypassPermissions"]));
    expect(command.args[command.args.indexOf("--settings") + 1]).toContain("http://127.0.0.1:3198/hooks/s1/Stop");
  });

  it("gives every Claude session the daemon's render_ui tool and says when to use it", () => {
    const command = commandFor({ id: "s1", kind: "claude" }, environment);
    const config = command.args[command.args.indexOf("--mcp-config") + 1];
    expect(JSON.parse(config ?? "")).toEqual({ mcpServers: { "agent-control": { type: "http", url: "http://127.0.0.1:3198/mcp/s1" } } });
    expect(command.args[command.args.indexOf("--allowedTools") + 1]).toBe("mcp__agent-control");
    expect(command.args[command.args.indexOf("--append-system-prompt") + 1]).toContain("render_ui");
    expect(command.args.filter((arg) => arg === "--mcp-config")).toHaveLength(1);
  });

  it("runs every Claude session, a conductor's workers included, without permission prompts", () => {
    const command = commandFor({ id: "s1", kind: "claude" }, environment);
    expect(command.args[command.args.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
  });

  it("passes the first prompt after --, so a prompt starting with a dash is not read as a flag", () => {
    const command = commandFor({ id: "s1", kind: "claude", prompt: "--help me" }, environment);
    expect(command.args.slice(-2)).toEqual(["--", "--help me"]);
  });

  it("resumes an earlier session instead of naming a new one", () => {
    const command = commandFor({ id: "old-1", kind: "claude", resumeSessionId: "old-1" }, environment);
    expect(command.args.slice(0, 2)).toEqual(["--resume", "old-1"]);
    expect(command.args).not.toContain("--session-id");
  });

  it("lets Claude read pasted attachments without asking for each one", () => {
    const command = commandFor({ id: "s1", kind: "claude" }, { ...environment, attachmentDirs: ["/tmp/agent-control/attachments"] });
    const settings = JSON.parse(command.args[command.args.indexOf("--settings") + 1] ?? "");
    expect(settings.permissions).toEqual({ allow: ["Read(//tmp/agent-control/attachments/**)"] });
    expect(command.args).not.toContain("--add-dir");
  });

  it("opens a login shell with no hooks", () => {
    expect(commandFor({ id: "s1", kind: "shell" }, environment)).toEqual({ file: "/bin/zsh", args: ["-l"] });
  });
});

describe("commandFor a conductor", () => {
  it("adds the daemon's MCP server, allows its tools, and appends the conductor role before --settings", () => {
    const command = commandFor({ id: "c1", kind: "claude", prompt: "plan it", conductor: true }, environment);
    const config = command.args[command.args.indexOf("--mcp-config") + 1];
    expect(JSON.parse(config ?? "")).toEqual({ mcpServers: { "agent-control": { type: "http", url: "http://127.0.0.1:3198/mcp/c1" } } });
    expect(command.args[command.args.indexOf("--allowedTools") + 1]).toBe("mcp__agent-control");
    expect(command.args).toContain("--append-system-prompt");
    expect(command.args.indexOf("--append-system-prompt")).toBeLessThan(command.args.indexOf("--settings"));
    expect(command.args.slice(-2)).toEqual(["--", "plan it"]);
  });

  it("adds the conductor role and the render_ui note in one appended prompt", () => {
    const command = commandFor({ id: "c1", kind: "claude", conductor: true }, environment);
    expect(command.args.filter((arg) => arg === "--append-system-prompt")).toHaveLength(1);
    const prompt = command.args[command.args.indexOf("--append-system-prompt") + 1] ?? "";
    expect(prompt).toContain("conductor");
    expect(prompt).toContain("render_ui");
  });

  it("opens a template card with its model, effort and, for a judge card, the route tool", () => {
    const command = commandFor({ id: "j1", kind: "claude", model: "sonnet", effort: "low", judge: true }, environment);
    expect(command.args).toEqual(expect.arrayContaining(["--model", "sonnet", "--effort", "low", "--allowedTools", "mcp__agent-control"]));
    expect(command.args[command.args.indexOf("--mcp-config") + 1]).toContain("http://127.0.0.1:3198/mcp/j1");
  });
});
