import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const built = path.join(process.cwd(), "dist", `Agent Control-darwin-${process.arch}`, "Agent Control.app");
if (!existsSync(built)) throw new Error(`missing ${built} — run \`yarn desktop:build\` first`);

const applications = path.join(homedir(), "Applications");
const target = path.join(applications, "Agent Control.app");
mkdirSync(applications, { recursive: true });

// -a: macOS pkill/pgrep skip their own ancestors by default, and the in-app build button runs this
// script in a shell under the app (app → next-server → daemon → shell), so without it the app survives.
// Anchored so -a does not also match an ancestor shell whose command line mentions the path.
const APP_PATTERN = "^/.+/Agent Control\\.app/Contents/MacOS/Agent Control( |$)";
const appRunning = () => {
  try {
    execFileSync("pgrep", ["-a", "-f", APP_PATTERN], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

try {
  execFileSync("pkill", ["-TERM", "-a", "-f", APP_PATTERN], { stdio: "ignore" });
  for (let waited = 0; waited < 10 && appRunning(); waited++) execFileSync("sleep", ["1"]);
  if (appRunning()) console.warn("[install-desktop] the running app did not quit within 10s");
} catch (error) {
  if (error?.status !== 1) console.warn("[install-desktop] could not stop the running app", error);
}

rmSync(target, { recursive: true, force: true });
execFileSync("ditto", [built, target]);
console.log(`installed ${target}`);

const dock = execFileSync("defaults", ["read", "com.apple.dock", "persistent-apps"], { encoding: "utf8" });
if (dock.includes("Agent%20Control.app") || dock.includes("Agent Control.app")) {
  console.log("already in Dock");
} else {
  const tile = `<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>${target}</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>`;
  execFileSync("defaults", ["write", "com.apple.dock", "persistent-apps", "-array-add", tile]);
  execFileSync("killall", ["Dock"]);
  console.log("added to Dock");
}
