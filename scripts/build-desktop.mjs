import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { packager } from "@electron/packager";

const root = process.cwd();
const dist = path.join(root, "dist");
const stage = path.join(dist, "desktop-stage");
const standalone = path.join(root, ".next", "standalone");

function readTokens() {
  const css = readFileSync(path.join(root, "app", "globals.css"), "utf8");
  const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const tokens = {};
  for (const match of rootBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

function buildIcon() {
  const tokens = readTokens();
  const iconDir = path.join(dist, "icon");
  const iconset = path.join(iconDir, "AgentControl.iconset");
  rmSync(iconDir, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="100" y="100" width="824" height="824" rx="184" fill="${tokens["--fg"]}"/>
  <circle cx="512" cy="330" r="92" fill="${tokens["--st-ask"]}"/>
  <circle cx="512" cy="560" r="92" fill="${tokens["--st-now"]}"/>
  <rect x="300" y="700" width="424" height="40" rx="20" fill="${tokens["--st-done"]}"/>
</svg>`;
  const svgPath = path.join(iconDir, "icon.svg");
  writeFileSync(svgPath, svg);
  const png = path.join(iconDir, "icon.png");
  execFileSync("sips", ["-s", "format", "png", svgPath, "--out", png], { stdio: "ignore" });
  if (!existsSync(png)) throw new Error("icon render failed (sips produced no PNG)");

  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync("sips", ["-z", String(size), String(size), png, "--out", path.join(iconset, `icon_${size}x${size}.png`)], { stdio: "ignore" });
    execFileSync("sips", ["-z", String(size * 2), String(size * 2), png, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: "ignore" });
  }
  const icns = path.join(iconDir, "AgentControl.icns");
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", icns]);
  return icns;
}

if (!existsSync(path.join(standalone, "server.js"))) {
  throw new Error("missing .next/standalone/server.js — run `next build` with output: \"standalone\" first");
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(standalone, path.join(stage, "server"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(stage, "server", ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(stage, "server", "public"), { recursive: true });
}
const runtimeDir = path.join("node_modules", "next", "dist", "compiled", "next-server");
for (const file of readdirSync(path.join(root, runtimeDir))) {
  if (file.endsWith(".runtime.prod.js")) {
    cpSync(path.join(root, runtimeDir, file), path.join(stage, "server", runtimeDir, file));
  }
}
cpSync(path.join(root, "desktop", "main.mjs"), path.join(stage, "main.mjs"));
cpSync(path.join(root, "desktop", "preload.cjs"), path.join(stage, "preload.cjs"));

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify({ name: "agent-control", productName: "Agent Control", version: pkg.version, main: "main.mjs" }, null, 2),
);

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim() || null;
  } catch (error) {
    console.warn("[build-desktop] git", args.join(" "), error.message);
    return null;
  }
};
const commit = git(["rev-parse", "HEAD"]);
if (commit) {
  const branch = git(["symbolic-ref", "--short", "-q", "HEAD"]);
  writeFileSync(path.join(stage, "server", "build-info.json"), JSON.stringify({ commit, branch, builtAt: Date.now() }, null, 2));
}

/** A codesigning identity (its SHA-1 or name, as `security find-identity -v -p codesigning` lists it), from the environment or the untracked `.env.desktop`. */
function signingIdentity() {
  if (process.env.AGENT_CONTROL_SIGN_IDENTITY) return process.env.AGENT_CONTROL_SIGN_IDENTITY;
  const file = path.join(root, ".env.desktop");
  if (!existsSync(file)) return null;
  const line = readFileSync(file, "utf8").match(/^AGENT_CONTROL_SIGN_IDENTITY=(.+)$/m);
  return line?.[1]?.trim().replace(/^["']|["']$/g, "") || null;
}

const daemonEntry = path.join(root, "daemon", "main.ts");
if (!existsSync(daemonEntry)) throw new Error(`missing ${daemonEntry}`);
if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`the session runner daemon needs Node 24 or newer to run TypeScript directly; this build ran on ${process.version}`);
}
writeFileSync(path.join(stage, "runner.json"), JSON.stringify({ node: process.execPath, daemonEntry }, null, 2));

const electronVersion = JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version;
const icon = buildIcon();

const [appPath] = await packager({
  dir: stage,
  out: dist,
  name: "Agent Control",
  platform: "darwin",
  arch: process.arch,
  electronVersion,
  icon,
  overwrite: true,
  prune: false,
  asar: false,
  appBundleId: "local.agent-control",
  appCategoryType: "public.app-category.developer-tools",
});

const appBundle = path.join(appPath, "Agent Control.app");
// The packaged binary keeps Electron's linker signature (identifier "Electron"), and macOS refuses
// notifications whose signing identifier does not match the bundle id, so it is always re-signed.
// macOS also ties folder permissions to the signature: an ad-hoc one is new on every build, so each
// build asked again. A keychain certificate keeps the signature (bundle id + certificate) the same.
const identity = signingIdentity();
if (!identity) console.warn(`[build-desktop] no signing identity in AGENT_CONTROL_SIGN_IDENTITY or .env.desktop — ad-hoc signing, so macOS will ask for folder access again after this build`);
execFileSync("codesign", ["--force", "--deep", "--sign", identity ?? "-", appBundle]);

console.log(`built ${appBundle}`);
