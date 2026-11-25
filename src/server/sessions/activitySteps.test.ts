import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chatItemsOf, inputDetail, stepsOf } from "./activitySteps";

const lines = readFileSync(path.join(import.meta.dirname, "../../../test/fixtures/transcript.jsonl"), "utf8").split("\n");

describe("stepsOf", () => {
  it("matches the current activity steps", () => {
    expect(stepsOf(lines)).toMatchSnapshot();
  });

  it("keeps only the last 40 steps", () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      JSON.stringify({ type: "user", uuid: `u${index}`, message: { content: `prompt ${index}` } }),
    );
    const steps = stepsOf(many);
    expect(steps).toHaveLength(40);
    expect(steps[0]).toMatchObject({ kind: "prompt", text: "prompt 5" });
  });
});

describe("chatItemsOf", () => {
  it("keeps a prompt sent as pasted text", () => {
    const chat = chatItemsOf([
      JSON.stringify({
        type: "user",
        uuid: "u1",
        message: { content: '\n\n<pasted_content id="a1b2">\n반품시켜 줘\n</pasted_content id="a1b2">\n' },
      }),
    ]);
    expect(chat).toMatchObject([{ kind: "prompt", text: "반품시켜 줘" }]);
  });

  it("keeps answers whole and shows each tool's input", () => {
    const long = "가".repeat(900);
    const chat = chatItemsOf([
      JSON.stringify({ type: "user", uuid: "u1", message: { content: "질문" } }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        message: {
          content: [
            { type: "text", text: long },
            { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/repo/a.ts", limit: 20 } },
          ],
        },
      }),
    ]);
    expect(chat.map((item) => item.kind)).toEqual(["prompt", "text", "tool"]);
    expect(chat[1]).toMatchObject({ kind: "text", text: long });
    expect(chat[2]).toMatchObject({ kind: "tool", name: "Read", detail: JSON.stringify({ file_path: "/repo/a.ts", limit: 20 }, null, 2) });
  });

  it("keeps a markdown file whole across Write and Edit", () => {
    const use = (id: string, name: string, input: Record<string, unknown>) =>
      JSON.stringify({ type: "assistant", uuid: id, message: { content: [{ type: "tool_use", id, name, input }] } });
    const file = "/repo/.pr-body.tmp.md";
    const chat = chatItemsOf([
      use("w1", "Write", { file_path: file, content: "## 변경사항\n- a" }),
      use("e1", "Edit", { file_path: file, old_string: "- a", new_string: "- b" }),
      use("w2", "Write", { file_path: "/repo/a.ts", content: "x" }),
    ]);
    expect(chat[0]).toMatchObject({ document: { path: file, content: "## 변경사항\n- a" } });
    expect(chat[1]).toMatchObject({ document: { path: file, content: "## 변경사항\n- b" } });
    expect(chat[2]).toMatchObject({ document: null });
  });

  it("reads a markdown file a shell heredoc writes", () => {
    const bash = (id: string, command: string) =>
      JSON.stringify({ type: "assistant", uuid: id, message: { content: [{ type: "tool_use", id, name: "Bash", input: { command } }] } });
    const chat = chatItemsOf([
      bash("b1", "cat > .pr-body.tmp.md <<'EOF'\n## 변경사항\n\n- a\nEOF\necho ok"),
      bash("b2", 'cat <<EOF > "/r/notes.md"\nx\nEOF'),
      bash("b3", "cat > a.ts <<'EOF'\nx\nEOF"),
      bash("b4", "git status"),
    ]);
    expect(chat[0]).toMatchObject({ document: { path: ".pr-body.tmp.md", content: "## 변경사항\n\n- a" } });
    expect(chat[1]).toMatchObject({ document: { path: "/r/notes.md", content: "x" } });
    expect(chat[2]).toMatchObject({ document: null });
    expect(chat[3]).toMatchObject({ document: null });
  });

  it("shows a command as it is", () => {
    expect(inputDetail({ command: "git status", description: "x" })).toBe("git status");
    expect(inputDetail({})).toBeNull();
  });
});

describe("chatItemsOf local commands", () => {
  const line = (entry: Record<string, unknown>) => JSON.stringify({ uuid: "u", timestamp: "2026-11-16T00:00:00Z", ...entry });

  it("shows typed slash commands, their output and shell commands", () => {
    const steps = chatItemsOf([
      line({ type: "user", isMeta: true, message: { content: "<local-command-caveat>x</local-command-caveat>" } }),
      line({ uuid: "a", type: "user", message: { content: "<command-name>/context</command-name>\n<command-message>context</command-message>\n<command-args></command-args>" } }),
      line({ uuid: "b", type: "system", subtype: "local_command", content: "<local-command-stdout>\u001b[2mContext 12%\u001b[0m</local-command-stdout>" }),
      line({ uuid: "c", type: "system", subtype: "local_command", content: "<local-command-stdout></local-command-stdout>" }),
      line({ uuid: "d", type: "user", message: { content: "<bash-input>git status</bash-input>" } }),
      line({ uuid: "e", type: "user", message: { content: "<bash-stdout>clean</bash-stdout><bash-stderr>warn</bash-stderr>" } }),
    ]);
    const shown = steps.map((step) =>
      step.kind === "prompt" || step.kind === "text" || step.kind === "output"
        ? { kind: step.kind, text: step.text, error: step.kind === "output" ? step.error : undefined }
        : { kind: step.kind },
    );
    expect(shown).toEqual([
      { kind: "prompt", text: "/context", error: undefined },
      { kind: "output", text: "Context 12%", error: false },
      { kind: "prompt", text: "! git status", error: undefined },
      { kind: "output", text: "clean", error: false },
      { kind: "output", text: "warn", error: true },
    ]);
  });

  it("hides the compact summary and marks an automatic compaction", () => {
    const boundary = (trigger: string) =>
      line({ uuid: `b-${trigger}`, type: "system", subtype: "compact_boundary", content: "Conversation compacted", compactMetadata: { trigger } });
    const summary = line({ uuid: "s", type: "user", isCompactSummary: true, message: { content: "This session is being continued from a previous conversation." } });
    const steps = chatItemsOf([
      boundary("manual"),
      summary,
      line({ uuid: "c", type: "user", message: { content: "<command-name>/compact</command-name>\n<command-args></command-args>" } }),
      line({ uuid: "o", type: "user", message: { content: "<local-command-stdout>Compacted</local-command-stdout>" } }),
      boundary("auto"),
      summary,
    ]);
    expect(steps.map((step) => (step.kind === "prompt" || step.kind === "output" ? [step.kind, step.text] : [step.kind]))).toEqual([
      ["prompt", "/compact"],
      ["output", "Compacted"],
      ["output", "대화가 길어져 자동으로 압축했어요"],
    ]);
  });

  it("keeps the activity timeline free of them", () => {
    expect(stepsOf([line({ type: "user", message: { content: "<command-name>/context</command-name>" } })])).toEqual([]);
  });
});

describe("chatItemsOf questions and plans", () => {
  const question = {
    question: "어디에 둘까요?",
    header: "위치",
    multiSelect: false,
    options: [
      { label: "위 (Recommended)", description: "맨 위에 둬요" },
      { label: "아래", description: "맨 아래에 둬요" },
    ],
  };
  const ask = JSON.stringify({
    type: "assistant",
    uuid: "a1",
    message: { content: [{ type: "tool_use", id: "q1", name: "AskUserQuestion", input: { questions: [question] } }] },
  });

  it("shows the whole question with the answer the user picked", () => {
    const steps = chatItemsOf([
      ask,
      JSON.stringify({
        type: "user",
        uuid: "u1",
        toolUseResult: { questions: [question], answers: { "어디에 둘까요?": "아래" } },
        message: { content: [{ type: "tool_result", tool_use_id: "q1", content: 'Your questions have been answered: "어디에 둘까요?"="아래".' }] },
      }),
    ]);
    expect(steps).toEqual([
      { kind: "question", id: "q1", at: null, questions: [question], answers: { "어디에 둘까요?": "아래" }, status: "ok" },
    ]);
  });

  it("keeps an unanswered question waiting", () => {
    expect(chatItemsOf([ask])).toMatchObject([{ kind: "question", answers: null, status: "running" }]);
  });

  it("shows a plan in full with whether it was approved or rejected", () => {
    const plan = (id: string) =>
      JSON.stringify({
        type: "assistant",
        uuid: `a-${id}`,
        message: { content: [{ type: "tool_use", id, name: "ExitPlanMode", input: { plan: "# 계획\n\n1. 고친다" } }] },
      });
    const result = (id: string, error: boolean, content: string) =>
      JSON.stringify({
        type: "user",
        uuid: `u-${id}`,
        message: { content: [{ type: "tool_result", tool_use_id: id, is_error: error, content }] },
      });
    const steps = chatItemsOf([plan("p1"), result("p1", false, "User has approved your plan."), plan("p2"), result("p2", true, "범위를 줄여 주세요")]);
    expect(steps).toEqual([
      { kind: "plan", id: "p1", at: null, plan: "# 계획\n\n1. 고친다", status: "ok", feedback: null },
      { kind: "plan", id: "p2", at: null, plan: "# 계획\n\n1. 고친다", status: "error", feedback: "범위를 줄여 주세요" },
    ]);
  });

  it("leaves the activity timeline's one-line tool rows as they are", () => {
    expect(stepsOf([ask])).toMatchObject([{ kind: "tool", name: "AskUserQuestion" }]);
  });

  describe("queued messages", () => {
    const enqueue = (content: string, at: string) => JSON.stringify({ type: "queue-operation", operation: "enqueue", timestamp: at, content });
    const dequeue = (at: string) => JSON.stringify({ type: "queue-operation", operation: "dequeue", timestamp: at });
    const absorbed = (content: string, at: string) =>
      JSON.stringify({ type: "queue-operation", operation: "remove", timestamp: at, content, reason: "absorbed_mid_turn" });
    const delivered = (prompt: string, at: string, commandMode = "prompt") =>
      JSON.stringify({ type: "attachment", uuid: `att-${prompt}`, timestamp: at, attachment: { type: "queued_command", prompt, commandMode, origin: { kind: "human" } } });

    it("shows a message typed mid-turn once Claude takes it in", () => {
      const steps = chatItemsOf([delivered("이것도 해줘", "2026-11-23T02:57:07.258Z")]);
      expect(steps).toEqual([{ kind: "prompt", id: "att-이것도 해줘:queued", at: Date.parse("2026-11-23T02:57:07.258Z"), text: "이것도 해줘" }]);
    });

    it("leaves out background task notifications that arrive through the same queue", () => {
      expect(chatItemsOf([delivered("<task-notification>done</task-notification>", "2026-11-23T02:57:07.258Z", "task-notification")])).toEqual([]);
    });

    it("lists messages still waiting in the queue at the end, marked as queued", () => {
      const steps = chatItemsOf([
        enqueue("첫째", "2026-11-23T02:00:00.000Z"),
        enqueue("둘째", "2026-11-23T02:00:01.000Z"),
        enqueue("셋째", "2026-11-23T02:00:02.000Z"),
        dequeue("2026-11-23T02:00:03.000Z"),
        absorbed("셋째", "2026-11-23T02:00:04.000Z"),
        enqueue("<task-notification>x</task-notification>", "2026-11-23T02:00:05.000Z"),
      ]);
      expect(steps).toEqual([{ kind: "prompt", id: "queued:1", at: Date.parse("2026-11-23T02:00:01.000Z"), text: "둘째", queued: true }]);
    });
  });
});

describe("chatItemsOf render_ui", () => {
  const surface = [
    { version: "1.0", createSurface: { surfaceId: "pick", catalogId: "https://agent-control.local/a2ui/catalog/v1" } },
    { version: "1.0", updateComponents: { surfaceId: "pick", components: [{ id: "root", component: "Text", text: "고르세요" }] } },
  ];
  const use = (input: Record<string, unknown>) =>
    JSON.stringify({ type: "assistant", uuid: "a1", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__agent-control__render_ui", input }] } });
  const result = JSON.stringify({ type: "user", uuid: "u2", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "Shown" }] } });

  it("draws a render_ui call as a ui step", () => {
    const chat = chatItemsOf([use({ messages: surface }), result]);
    expect(chat).toMatchObject([{ kind: "ui", id: "t1", surfaceId: "pick", messages: surface, status: "ok", action: null }]);
  });

  it("folds the person's [A2UI action] reply into the card instead of a prompt bubble", () => {
    const reply = JSON.stringify({ type: "user", uuid: "u3", message: { content: '[A2UI action] surface=pick name=choose\n{"plan":"A"}' } });
    const chat = chatItemsOf([use({ messages: surface }), result, reply]);
    expect(chat).toHaveLength(1);
    expect(chat[0]).toMatchObject({ kind: "ui", action: { surfaceId: "pick", name: "choose", context: { plan: "A" } } });
  });

  it("leaves a reply for an already answered card as an ordinary prompt", () => {
    const reply = (uuid: string, plan: string) =>
      JSON.stringify({ type: "user", uuid, message: { content: `[A2UI action] surface=pick name=choose\n{"plan":"${plan}"}` } });
    const chat = chatItemsOf([use({ messages: surface }), result, reply("u3", "A"), reply("u4", "B")]);
    expect(chat.map((item) => item.kind)).toEqual(["ui", "prompt"]);
    expect(chat[0]).toMatchObject({ action: { context: { plan: "A" } } });
  });

  it("keeps a broken render_ui call as an ordinary tool row", () => {
    const chat = chatItemsOf([use({ messages: [{ version: "1.0", updateComponents: {} }] })]);
    expect(chat).toMatchObject([{ kind: "tool", name: "mcp__agent-control__render_ui" }]);
  });
});

// Records copied from a real Claude Code 2.1.331 transcript, with the text shortened and the signature cut to its head.
const THINKING_SIGNATURE = "CAQS/ggKEAgUGAI4AUIIdGhpbmtpbmcSDNIL+FPi18lN6Dz18xoMDiNg1KtnlsxBa5LL";
const NARRATION_SIGNATURE = "CAQS3AkKEQgUGAI4AUIJbmFycmF0aW9uEgyUmL2sU9iUnb/dZnwaDOMY9KcHdNCalXtC";

describe("what the terminal prints besides answers and tool calls", () => {
  const assistant = (uuid: string, block: Record<string, unknown>) =>
    JSON.stringify({ type: "assistant", uuid, isSidechain: false, thinkingDisplay: "summarized", message: { role: "assistant", content: [block] } });
  const turn = [
    JSON.stringify({ type: "user", uuid: "u1", message: { content: "지금 측정하는건 뭐지?" } }),
    assistant("a1", { type: "thinking", thinking: "I'm looking at the 1:1 inquiry Maestro flows.", signature: THINKING_SIGNATURE }),
    assistant("a2", { type: "thinking", thinking: "손잡이 변경으로 손댄 1:1 문의 flow 3개를 펼친 폴드에서 확인 중이며 원인을 찾겠습니다.\n\n", signature: NARRATION_SIGNATURE }),
    assistant("a3", { type: "tool_use", id: "t1", name: "Bash", input: { command: "maestro hierarchy" } }),
  ];

  it("shows the progress note Claude writes between tool calls as an answer, and its thinking as thinking", () => {
    expect(chatItemsOf(turn)).toMatchObject([
      { kind: "prompt", text: "지금 측정하는건 뭐지?" },
      { kind: "thinking", id: "a1:0", text: "I'm looking at the 1:1 inquiry Maestro flows." },
      { kind: "text", id: "a2:0", text: "손잡이 변경으로 손댄 1:1 문의 flow 3개를 펼친 폴드에서 확인 중이며 원인을 찾겠습니다." },
      { kind: "tool", name: "Bash" },
    ]);
  });

  it("keeps the progress note in the short activity list, without the thinking", () => {
    expect(stepsOf(turn).map((step) => step.kind)).toEqual(["prompt", "text", "tool"]);
  });

  it("skips a thinking block Claude Code recorded without its text", () => {
    const chat = chatItemsOf([assistant("a1", { type: "thinking", thinking: "", signature: THINKING_SIGNATURE })]);
    expect(chat).toEqual([]);
  });

  it("shows the notices Claude Code prints itself: a recap, a notice, a scheduled wake-up and a finished background task", () => {
    const system = (uuid: string, subtype: string, content: string) => JSON.stringify({ type: "system", uuid, subtype, content, isMeta: false });
    const chat = chatItemsOf([
      system("s1", "away_summary", "Android 빌드가 아직 돌고 있습니다. (turn off recaps in /config)"),
      system("s2", "informational", "Compacted while idle, before the prompt cache expired"),
      system("s3", "scheduled_task_fire", "Claude resuming /loop wakeup (Nov 19 10:54am)"),
      JSON.stringify({
        type: "user",
        uuid: "n1",
        origin: { kind: "task-notification" },
        message: {
          content:
            '<task-notification>\n<task-id>b472g8a8p</task-id>\n<status>completed</status>\n<summary>Background command "Wait until fold inner display turns on" completed (exit code 0)</summary>\n</task-notification>',
        },
      }),
      system("s4", "turn_duration", ""),
    ]);
    expect(chat).toMatchObject([
      { kind: "output", text: "Android 빌드가 아직 돌고 있습니다. (turn off recaps in /config)", error: false },
      { kind: "output", text: "Compacted while idle, before the prompt cache expired", error: false },
      { kind: "output", text: "Claude resuming /loop wakeup (Nov 19 10:54am)", error: false },
      { kind: "output", text: 'Background command "Wait until fold inner display turns on" completed (exit code 0)', error: false },
    ]);
    expect(chat).toHaveLength(4);
  });
});
