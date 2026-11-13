import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const SAME_VALUE_INTERVAL_MS = 60_000;
const REPORT_TIMEOUT_MS = 1_000;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parse(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

function reportedPart(input) {
  return {
    model: input.model ?? null,
    context_window: input.context_window ?? null,
    rate_limits: input.rate_limits ?? null,
  };
}

async function shouldReport(url, body) {
  const stateDir = path.join(tmpdir(), "agent-control-statusline");
  const stateFile = path.join(stateDir, `${createHash("sha1").update(url).digest("hex")}.json`);
  const key = createHash("sha1").update(body).digest("hex");
  const previous = parse(await readFile(stateFile, "utf8").catch(() => ""));
  const now = Date.now();
  if (previous && previous.key === key && now - Number(previous.at) < SAME_VALUE_INTERVAL_MS) return false;
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, JSON.stringify({ key, at: now }));
  return true;
}

async function report(url, input) {
  if (!url || !input) return;
  const body = JSON.stringify(reportedPart(input));
  try {
    if (!(await shouldReport(url, body))) return;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    });
  } catch {
    return;
  }
}

async function originalCommand() {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude");
  const settings = parse(await readFile(path.join(configDir, "settings.json"), "utf8").catch(() => ""));
  const statusLine = settings?.statusLine;
  return statusLine && statusLine.type === "command" && typeof statusLine.command === "string" ? statusLine.command : null;
}

async function render(text) {
  const command = await originalCommand();
  if (!command) return;
  await new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", resolve);
    child.on("close", resolve);
    child.stdin.on("error", () => {});
    child.stdin.end(text);
  });
}

const text = await readStdin();
await Promise.all([report(process.argv[2], parse(text)), render(text)]);
