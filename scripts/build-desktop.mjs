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

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify({ name: "agent-control", productName: "Agent Control", version: pkg.version, main: "main.mjs" }, null, 2),
);

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

console.log(`built ${path.join(appPath, "Agent Control.app")}`);
