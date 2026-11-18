// Run by the dashboard's "앱 빌드 · 재설치" button in a shell box. It records each phase in
// dist/app-build.json so the panel can follow the job across the app restart, which kills the
// server that started it.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import path from "node:path";

const root = process.cwd();
const statusFile = path.join(root, "dist", "app-build.json");
const appPath = path.join(homedir(), "Applications", "Agent Control.app");
const PORT = Number(process.env.AGENT_CONTROL_PORT ?? 3199);
const RELAUNCH_TIMEOUT_MS = 90_000;

const startedAt = Date.now();
let commit = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() || null;
} catch (error) {
  console.warn("[apply-app] git rev-parse", error.message);
}

function record(fields) {
  mkdirSync(path.dirname(statusFile), { recursive: true });
  writeFileSync(statusFile, JSON.stringify({ pid: process.pid, startedAt, commit, ...fields }, null, 2));
}

function fail(phase, message) {
  console.error(`[apply-app] ${message}`);
  record({ phase, result: "failed", message, finishedAt: Date.now() });
  process.exit(1);
}

function step(phase, args) {
  record({ phase });
  const result = spawnSync("bun", args, { cwd: root, stdio: "inherit" });
  if (result.error) fail(phase, `bun ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(phase, `bun ${args.join(" ")} exited with ${result.status ?? result.signal}`);
}

function runningCommit() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${PORT}/api/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.app === "agent-control" ? (parsed.commit ?? null) : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on("error", () => resolve(null));
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(null);
    });
  });
}

step("building", ["run", "desktop:build"]);
step("installing", ["run", "desktop:install"]);
step("installing", ["run", "skills:install"]);

record({ phase: "relaunching" });
const opened = spawnSync("open", [appPath], { stdio: "inherit" });
if (opened.status !== 0) fail("relaunching", `open "${appPath}" exited with ${opened.status ?? opened.signal}`);

const deadline = Date.now() + RELAUNCH_TIMEOUT_MS;
let seen = null;
while (Date.now() < deadline) {
  seen = await runningCommit();
  if (seen && (commit === null || seen === commit)) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!seen) fail("relaunching", `the app did not answer on port ${PORT} within ${RELAUNCH_TIMEOUT_MS / 1000}s`);
if (commit !== null && seen !== commit) fail("relaunching", `the app came back on ${seen.slice(0, 7)}, not the build ${commit.slice(0, 7)}`);

record({ phase: "relaunching", result: "done", finishedAt: Date.now() });
console.log(`[apply-app] Agent Control is running ${commit ? commit.slice(0, 7) : "the new build"}`);
