import { describe, expect, it } from "vitest";
import { liveConversations } from "./liveConversations";

const RUNNER = "cd3520ec-c566-4952-95cb-41e8de62bce3";
const PICKED = "bb294caa-6fd8-464a-b7c5-1d3da0fcce6c";

describe("liveConversations", () => {
  it("reads the session a runner's Claude process moved to", async () => {
    const live = await liveConversations({
      execFile: async () => ({
        stdout: [
          `  75091 /Users/me/.local/bin/claude --session-id ${RUNNER} --settings {"hooks":{}}`,
          "  100 /usr/bin/zsh",
          `  200 claude --resume ${PICKED}`,
        ].join("\n"),
        stderr: "",
      }),
      readFile: async (file) => {
        if (file === "/s/75091.json") return JSON.stringify({ pid: 75091, sessionId: PICKED });
        throw new Error("missing");
      },
      sessionsDir: "/s",
    });
    expect([...live]).toEqual([[RUNNER, PICKED]]);
  });
});
