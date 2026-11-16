import { describe, expect, it } from "vitest";
import { commandFor } from "./command.ts";

const environment = { claude: "claude", shell: "/bin/zsh", baseUrl: "http://127.0.0.1:3198" };

describe("commandFor", () => {
  it("starts a new Claude session under the daemon's id, with the hooks that report its status", () => {
    const command = commandFor({ id: "s1", kind: "claude" }, environment);
    expect(command.file).toBe("claude");
    expect(command.args.slice(0, 3)).toEqual(["--session-id", "s1", "--settings"]);
    expect(command.args[3]).toContain("http://127.0.0.1:3198/hooks/s1/Stop");
    expect(command.args).toHaveLength(4);
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
    const command = commandFor({ id: "s1", kind: "claude" }, { ...environment, attachmentDir: "/tmp/agent-control/attachments" });
    expect(command.args.slice(2, 4)).toEqual(["--add-dir", "/tmp/agent-control/attachments"]);
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

  it("leaves ordinary sessions without orchestration tools", () => {
    expect(commandFor({ id: "s1", kind: "claude" }, environment).args).not.toContain("--mcp-config");
  });
});
