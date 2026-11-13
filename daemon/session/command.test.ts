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

  it("opens a login shell with no hooks", () => {
    expect(commandFor({ id: "s1", kind: "shell" }, environment)).toEqual({ file: "/bin/zsh", args: ["-l"] });
  });
});
