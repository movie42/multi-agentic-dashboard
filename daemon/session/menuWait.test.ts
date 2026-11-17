import { describe, expect, it } from "vitest";
import { SessionRegistry, type PtyProcess } from "./SessionRegistry.ts";

const RULE = "─".repeat(40);
const CLEAR = "\x1b[2J\x1b[H";

function setup() {
  const emit: { data: (data: string) => void } = { data: () => {} };
  const pty: PtyProcess = {
    onData: (listener) => {
      emit.data = listener;
    },
    onExit: () => {},
    write: () => {},
    resize: () => {},
    kill: () => {},
  };
  const registry = new SessionRegistry({
    spawn: () => pty,
    commandFor: () => ({ file: "claude", args: [] }),
    env: {},
    now: () => 1000,
    newId: () => "s1",
  });
  registry.launch({ cwd: "/repo" });
  registry.signal("s1", { event: "SessionStart" });
  const draw = (lines: string[]) => emit.data(CLEAR + lines.join("\r\n"));
  return { registry, draw };
}

const settled = async (registry: SessionRegistry) => {
  await registry.screen("s1");
  await new Promise((resolve) => setTimeout(resolve, 0));
  return registry.get("s1")?.status;
};

const MODEL_CONFIRM = ["Switch to Fable 5.2?", "", "❯ 1. Yes, switch", "  2. No, keep the current model", "", "Enter to confirm · Esc to cancel"];
const PROMPT_BOX = [RULE, "❯ ", RULE, "  🧠 Opus"];

describe("a choice list drawn only in the terminal", () => {
  it("marks an idle session as waiting on the user although no hook fired", async () => {
    const { registry, draw } = setup();
    expect(registry.get("s1")?.status).toBe("idle");
    draw(MODEL_CONFIRM);
    expect(await settled(registry)).toBe("waiting");
  });

  it("goes back to idle once the list leaves the screen", async () => {
    const { registry, draw } = setup();
    draw(MODEL_CONFIRM);
    await settled(registry);
    draw(["Set model to Fable 5.2", "", ...PROMPT_BOX]);
    expect(await settled(registry)).toBe("idle");
  });

  it("leaves a waiting state set by a notification hook alone", async () => {
    const { registry, draw } = setup();
    registry.signal("s1", { event: "Notification", notificationType: "permission_prompt" });
    draw(["working…", "", ...PROMPT_BOX]);
    expect(await settled(registry)).toBe("waiting");
  });

  it("does not take a multi-line message typed in the prompt box for a list", async () => {
    const { registry, draw } = setup();
    draw(["⏺ done", "", RULE, "❯ first line", "  second line", RULE, "  🧠 Opus"]);
    expect(await settled(registry)).toBe("idle");
  });

  it("does not take a list quoted in the conversation above the prompt box for a live one", async () => {
    const { registry, draw } = setup();
    draw(["⏺ the dialog looked like this:", "", "  ❯ 1. Yes", "    2. No", "", ...PROMPT_BOX]);
    expect(await settled(registry)).toBe("idle");
  });
});
